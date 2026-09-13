// controllers/userController.js

import User from "../models/user.model.js"
import { clerkClient, getAuth } from "@clerk/express";
export const syncUser = async (req, res) => {
  try {

    const { userId } = getAuth(req)

    // This route deliberately sits outside `protect` — it is what creates the Mongo user
    // that `protect` looks up — so it has to do its own signed-in check. Without it an
    // anonymous or expired-token request fell through to `clerkClient.users.getUser(undefined)`,
    // which throws and was caught below as a 500 "A valid resource ID is required."
    // Clients read that as a server outage instead of "sign in again".
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" })
    }

    // Fetch full user info from Clerk directly
    const clerkUser = await clerkClient.users.getUser(userId)
    let user = await User.findOne({ clerkId: userId })

    if (!user) {
      user = await User.create({
        clerkId: userId,
        email: clerkUser.emailAddresses[0]?.emailAddress,
        name: `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`,
        imageUrl: clerkUser.imageUrl,
      })

      return res.status(201).json({
        success: true,
        data: user,
      })
    }

    return res.status(200).json({
      success: true,
      data: user,
    })
  } catch (error) {
    return res.status(500).json({
        success: false,
        message: error.message,
        error: error
      })
  }
}

//get current user
export const getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: req.user,
    })
  } catch (error) {
    next(error)
  }
}

export const updateProfile = async (req, res, next) => {
  try {
    const { name, imageUrl } = req.body

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, imageUrl },
      { new: true },
    )

    res.status(200).json({
      success: true,
      data: user,
    })
  } catch (error) {
    next(error)
  }
}
