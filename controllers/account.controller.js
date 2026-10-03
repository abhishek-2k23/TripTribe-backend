// controllers/account.controller.js
//
// Account deletion and data export — required for App Store / Play Store listing.
//
// Deletion anonymizes the User document instead of removing it. Expenses keep `paidBy`,
// `recordedBy` and `splitDetails.user` references that the other members' balances depend on,
// and `getTripDebts` dereferences `paidBy._id` — a deleted payer would break Settle Up for the
// whole trip. So the person is erased (name, email, photo, Clerk id) while the ledger stays valid.

import { clerkClient } from "@clerk/express";
import cloudinary from "../config/cloudinary.js";
import User from "../models/user.model.js";
import Trip from "../models/trip.model.js";
import Itinerary from "../models/Itinerary.model.js";
import Expense from "../models/expense.model.js";
import Checklist from "../models/checklist.model.js";
import File from "../models/file.model.js";
import Message from "../models/message.model.js";
import AiThread from "../models/aiThread.model.js";
import AiMessage from "../models/aiMessage.model.js";
import AiJob from "../models/aiJob.model.js";
import AiUpload from "../models/aiUpload.model.js";
import ItineraryProposal from "../models/itineraryProposal.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import CreditAccount from "../models/creditAccount.model.js";
import Device from "../models/device.model.js";
import TripRevision from "../models/tripRevision.model.js";
import UsageCounter from "../models/usageCounter.model.js";

const DELETED_NAME = "Deleted user";

/**
 * Best-effort Cloudinary cleanup. Uploads use `resource_type: "auto"`, so images and PDFs are
 * stored as "image", videos as "video", and anything else as "raw". A failure is logged and
 * skipped: a leftover asset must not block someone's account deletion.
 *
 * Documents are stored as `authenticated` and cover images as `upload`, and destroy will not find
 * an asset under the wrong delivery type, so both are tried for records written before that
 * distinction existed (design.md D-012).
 */
async function destroyAssets(assets) {
  let destroyed = 0;
  for (const { public_id, fileType, resourceType, deliveryType } of assets) {
    if (!public_id) continue;

    const resourceTypes = resourceType
      ? [resourceType]
      : fileType?.startsWith("video/")
        ? ["video"]
        : ["image", "raw"];
    const deliveryTypes = deliveryType ? [deliveryType] : ["authenticated", "upload"];

    let done = false;
    for (const resource_type of resourceTypes) {
      for (const type of deliveryTypes) {
        try {
          const result = await cloudinary.uploader.destroy(public_id, { resource_type, type });
          if (result?.result === "ok") {
            destroyed += 1;
            done = true;
            break;
          }
        } catch (error) {
          console.warn(`Cloudinary destroy failed for ${public_id} (${resource_type}/${type}):`, error?.message);
        }
      }
      if (done) break;
    }
  }
  return destroyed;
}

/** The member who inherits ownership: longest-standing editor, else longest-standing member. */
function pickHeir(members) {
  const byJoinDate = [...members].sort(
    (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
  );
  return byJoinDate.find((m) => m.role === "editor") ?? byJoinDate[0];
}

// DELETE /api/users/me
export const deleteMyAccount = async (req, res, next) => {
  const user = req.user;
  const userId = user._id;
  const userIdString = userId.toString();

  const summary = {
    tripsDeleted: [],
    ownershipTransferred: [],
    tripsLeft: [],
    messagesDeleted: 0,
    filesDeleted: 0,
    expensesKept: 0,
    assetsDestroyed: 0,
    aiConversationsDeleted: 0,
    signInAccountDeleted: false,
  };

  try {
    // 1. Trips: delete the ones nobody else is in, hand over ownership, leave the rest.
    const trips = await Trip.find({ "members.user": userId });
    const deletedTripIds = [];
    const deletedCovers = [];

    for (const trip of trips) {
      const others = trip.members.filter((m) => m.user.toString() !== userIdString);
      const me = trip.members.find((m) => m.user.toString() === userIdString);

      if (others.length === 0) {
        deletedTripIds.push(trip._id);
        if (trip.image?.public_id) deletedCovers.push({ public_id: trip.image.public_id });
        summary.tripsDeleted.push({ _id: trip._id, name: trip.name });
        continue;
      }

      if (me?.role === "owner" && !others.some((m) => m.role === "owner")) {
        const heir = pickHeir(others);
        heir.role = "owner";
        summary.ownershipTransferred.push({ _id: trip._id, name: trip.name, newOwner: heir.user });
      } else {
        summary.tripsLeft.push({ _id: trip._id, name: trip.name });
      }

      trip.members = others;
      await trip.save();
    }

    if (deletedTripIds.length > 0) {
      const tripFiles = await File.find({ tripId: { $in: deletedTripIds } }).select("public_id fileType resourceType deliveryType");
      summary.assetsDestroyed += await destroyAssets([...tripFiles, ...deletedCovers]);

      await Promise.all([
        Itinerary.deleteMany({ trip: { $in: deletedTripIds } }),
        Expense.deleteMany({ trip: { $in: deletedTripIds } }),
        // Checklist.tripId is stored as a String, unlike every other trip reference.
        Checklist.deleteMany({ tripId: { $in: deletedTripIds.map(String) } }),
        File.deleteMany({ tripId: { $in: deletedTripIds } }),
        Message.deleteMany({ trip: { $in: deletedTripIds } }),
        ItineraryProposal.deleteMany({ trip: { $in: deletedTripIds } }),
        TripRevision.deleteMany({ trip: { $in: deletedTripIds } }),
        // A deleted trip's credit pool goes with it (credits are forfeited, as below).
        CreditLedger.deleteMany({ trip: { $in: deletedTripIds }, bucket: "pool" }),
        Trip.deleteMany({ _id: { $in: deletedTripIds } }),
      ]);
    }

    // 2. The user's own content in trips that continue without them.
    const ownFiles = await File.find({ uploadedBy: userId }).select("public_id fileType resourceType deliveryType");
    summary.assetsDestroyed += await destroyAssets(ownFiles);
    summary.filesDeleted = (await File.deleteMany({ uploadedBy: userId })).deletedCount;

    summary.messagesDeleted = (await Message.deleteMany({ sender: userId })).deletedCount;

    // AI conversations, jobs, pending receipt photos and credits. Credits are forfeited.
    const aiThreadIds = (await AiThread.find({ user: userId }).select("_id").lean()).map((t) => t._id);
    await Promise.all([
      AiMessage.deleteMany({ $or: [{ thread: { $in: aiThreadIds } }, { user: userId }] }),
      AiThread.deleteMany({ user: userId }),
      AiUpload.deleteMany({ user: userId }),
      AiJob.deleteMany({ user: userId }),
      // Personal buckets only. Pool rows this user funded or spent belong to trips that carry on
      // without them; deleting those would change the pool balance for everyone else. They keep
      // pointing at the anonymized user record.
      CreditLedger.deleteMany({ user: userId, bucket: { $ne: "pool" } }),
      CreditAccount.deleteOne({ _id: userId }),
      // Push targets, or the phone keeps being woken for trips this account no longer has.
      Device.deleteMany({ user: userId }),
      // Daily quota counters; they expire on their own within two days, but hold the user id until then.
      UsageCounter.deleteMany({ user: userId }),
    ]);
    summary.aiConversationsDeleted = aiThreadIds.length;

    await Itinerary.updateMany(
      { "sections.activities.comments.user": userId },
      { $pull: { "sections.$[].activities.$[].comments": { user: userId } } }
    );

    await Checklist.updateMany(
      { "categories.items.completedBy": userId },
      { $pull: { "categories.$[].items.$[].completedBy": userId } }
    );

    // 3. Shared financial records stay, attributed to the anonymized profile below.
    summary.expensesKept = await Expense.countDocuments({
      $or: [{ paidBy: userId }, { recordedBy: userId }, { "splitDetails.user": userId }],
    });

    // 4. Erase the person. Replacing `clerkId` also means this record can never be signed into again.
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          name: DELETED_NAME,
          email: `deleted+${userIdString}@deleted.invalid`,
          clerkId: `deleted:${userIdString}`,
          isActive: false,
        },
        $unset: { imageUrl: 1 },
      }
    );

    // 5. Remove the sign-in account last. If this fails, the user can sign in again (which creates a
    //    fresh, empty Trip Tribe record) and repeat the deletion to finish.
    try {
      await clerkClient.users.deleteUser(user.clerkId);
      summary.signInAccountDeleted = true;
    } catch (error) {
      if (error?.status === 404) {
        summary.signInAccountDeleted = true;
      } else {
        console.error("Clerk user deletion failed:", error);
        return res.status(502).json({
          success: false,
          message:
            "Your Trip Tribe data was deleted, but removing your sign-in account failed. Sign in again and repeat the deletion to finish.",
          data: summary,
        });
      }
    }

    return res.status(200).json({ success: true, message: "Account deleted", data: summary });
  } catch (error) {
    next(error);
  }
};

// GET /api/users/me/export
export const exportMyData = async (req, res, next) => {
  try {
    const user = req.user;
    const userId = user._id;
    const userIdString = userId.toString();

    const [trips, messages, expenses, files, itineraries, checklists, aiThreads, aiMessages, creditLedger] = await Promise.all([
      Trip.find({ "members.user": userId })
        .select("name location description startDate endDate members createdAt")
        .lean(),
      Message.find({ sender: userId }).select("trip text createdAt").lean(),
      Expense.find({
        $or: [{ paidBy: userId }, { recordedBy: userId }, { "splitDetails.user": userId }],
      })
        .select("trip title description amount category paidBy splitType splitDetails expenseDate")
        .lean(),
      File.find({ uploadedBy: userId }).select("tripId name category notes url fileType size createdAt").lean(),
      Itinerary.find({ "sections.activities.comments.user": userId }).select("trip date sections").lean(),
      Checklist.find({ "categories.items.completedBy": userId }).select("tripId categories").lean(),
      AiThread.find({ user: userId }).select("trip title createdAt").lean(),
      AiMessage.find({ user: userId }).select("thread role content createdAt").sort({ createdAt: 1 }).lean(),
      CreditLedger.find({ user: userId }).select("bucket delta reason note createdAt").sort({ createdAt: 1 }).lean(),
    ]);

    // Only this user's own data: roles instead of full rosters, own shares instead of everyone's.
    const activityComments = itineraries.flatMap((day) =>
      day.sections.flatMap((section) =>
        section.activities.flatMap((activity) =>
          (activity.comments ?? [])
            .filter((c) => c.user?.toString() === userIdString)
            .map((c) => ({ trip: day.trip, activity: activity.title, text: c.text, createdAt: c.createdAt }))
        )
      )
    );

    const checklistItemsCompleted = checklists.flatMap((checklist) =>
      checklist.categories.flatMap((category) =>
        category.items
          .filter((item) => (item.completedBy ?? []).some((id) => id.toString() === userIdString))
          .map((item) => ({ trip: checklist.tripId, category: category.name, item: item.title }))
      )
    );

    res.status(200).json({
      success: true,
      data: {
        exportedAt: new Date().toISOString(),
        profile: {
          _id: user._id,
          name: user.name,
          email: user.email,
          imageUrl: user.imageUrl,
          createdAt: user.createdAt,
        },
        trips: trips.map((trip) => ({
          _id: trip._id,
          name: trip.name,
          location: trip.location,
          description: trip.description,
          startDate: trip.startDate,
          endDate: trip.endDate,
          role: trip.members.find((m) => m.user.toString() === userIdString)?.role,
          joinedAt: trip.members.find((m) => m.user.toString() === userIdString)?.joinedAt,
        })),
        messages,
        activityComments,
        checklistItemsCompleted,
        expenses: expenses.map((expense) => ({
          _id: expense._id,
          trip: expense.trip,
          title: expense.title,
          description: expense.description,
          amount: expense.amount,
          category: expense.category,
          expenseDate: expense.expenseDate,
          youPaid: expense.paidBy?.toString() === userIdString,
          yourShare:
            expense.splitDetails.find((s) => s.user.toString() === userIdString) ?? null,
        })),
        files,
        aiConversations: aiThreads.map((thread) => ({
          ...thread,
          messages: aiMessages.filter((m) => m.thread.toString() === thread._id.toString()),
        })),
        credits: creditLedger,
      },
    });
  } catch (error) {
    next(error);
  }
};
