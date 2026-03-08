import Checklist from "../models/checklist.model.js"

export const bulkAddChecklistItems = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const { categoryName, itemNames } = req.body;

    if (!Array.isArray(itemNames) || itemNames.length === 0) {
      return res.status(400).json({ success: false, message: "Please provide an array of items." });
    }

    let checklist = await Checklist.findOne({ tripId });

    if (!checklist) {
      // CASE 1: Completely new checklist
      const newItems = itemNames.map((name) => ({ title: name }));
      checklist = new Checklist({
        tripId,
        categories: [{ name: categoryName, items: newItems }],
      });
    } else {
      // CASE 2: Find or create category
      let category = checklist.categories.find(
        (cat) => cat.name.toLowerCase() === categoryName.toLowerCase()
      );

      if (category) {
        const existingTitles = category.items.map((i) => i.title.toLowerCase());
        const uniqueNewItems = itemNames
          .filter((name) => !existingTitles.includes(name.toLowerCase()))
          .map((name) => ({ title: name }));

        if (uniqueNewItems.length === 0) {
          return res.status(400).json({ success: false, message: "Items already exist." });
        }
        category.items.push(...uniqueNewItems);
      } else {
        checklist.categories.push({
          name: categoryName,
          items: itemNames.map((name) => ({ title: name })),
        });
      }
    }

    // Save the checklist (for both new and existing)
    await checklist.save();

    // --- SOCKET LOGIC ---
    const io = req.app.get("socketio");
    const roomName = tripId.toString();

    if (io) {
      const connectedSockets = io.sockets.adapter.rooms.get(roomName);
      console.log(`--- SOCKET DEBUG ---`);
      console.log(`Target Room: ${roomName} | Users: ${connectedSockets ? connectedSockets.size : 0}`);

      // Broadcast the updated categories to everyone in the trip
      io.to(roomName).emit("checklist_updated", checklist.categories);
    }

    res.status(200).json({ success: true, data: checklist });
  } catch (error) {
    next(error);
  }
};

export const addItemToCategory = async (req, res, next) => {
  try {
    const { tripId, categoryId } = req.params
    const { title } = req.body

    const checklist = await Checklist.findOneAndUpdate(
      { tripId, "categories._id": categoryId },
      { $push: { "categories.$.items": { title } } },
      { new: true },
    )

    res.status(200).json({ success: true, data: checklist })
  } catch (error) {
    next(error)
  }
}

// 3. Toggle Item Completion (The avatar sync logic)
export const toggleItem = async (req, res, next) => {
  try {
    const { tripId, categoryId, itemId } = req.params;
    const { isChecked } = req.body;
    const userId = req.user._id;

    
    const updateAction = isChecked 
      ? { $addToSet: { "categories.$[cat].items.$[itm].completedBy": userId } }
      : { $pull: { "categories.$[cat].items.$[itm].completedBy": userId } };

    const checklist = await Checklist.findOneAndUpdate(
      { tripId },
      updateAction,
      {
        arrayFilters: [{ "cat._id": categoryId }, { "itm._id": itemId }],
        new: true
      }
    ).populate("categories.items.completedBy", "name imageUrl");

    const updatedCategory = checklist.categories.id(categoryId);
    const updatedItem = updatedCategory.items.id(itemId);

    const io = req.app.get("socketio");
    if (io) {
      io.to(tripId.toString()).emit("task_toggled", {
        categoryId,
        itemId,
        updatedItem 
      });
    }

    res.status(200).json({ success: true, data: updatedItem });
  } catch (error) {
    next(error);
  }
};

export const getTripChecklist = async (req, res, next) => {
  try {
    const { tripId } = req.params;

    const checklist = await Checklist.findOne({ tripId })
      .populate({
        path: "categories.items.completedBy",
        select: "name imageUrl", 
      })
      .lean(); 

    if (!checklist) {
      return res.status(200).json({
        success: true,
        data: { 
          tripId, 
          categories: [] 
        },
      });
    }

    const sanitizedCategories = checklist.categories.map(category => ({
      ...category,
      items: category.items.map(item => ({
        ...item,
        completedBy: Array.isArray(item.completedBy) ? item.completedBy : []
      }))
    }));

    res.status(200).json({
      success: true,
      data: {
        ...checklist,
        categories: sanitizedCategories
      },
    });
  } catch (error) {
    console.error("Fetch Checklist Error:", error);
    next(error);
  }
};

export const updateChecklistOrItem = async (req, res) => {
  try {
    const { tripId, categoryId } = req.params
    const { newCategoryName, itemId, newItemName } = req.body

    let updateQuery = {}
    let arrayFilters = []

    // Case 1: Updating an Item Title
    if (itemId && newItemName) {
      updateQuery = {
        $set: { "categories.$[cat].items.$[itm].title": newItemName },
      }
      arrayFilters = [{ "cat._id": categoryId }, { "itm._id": itemId }]
    }
    // Case 2: Updating the Category Name
    else if (newCategoryName) {
      updateQuery = { $set: { "categories.$.name": newCategoryName } }
    }

    const updatedChecklist = await Checklist.findOneAndUpdate(
      { tripId, "categories._id": categoryId },
      updateQuery,
      {
        arrayFilters: arrayFilters.length > 0 ? arrayFilters : undefined,
        new: true,
      },
    ).populate("categories.items.completedBy", "name imageUrl")

    res.status(200).json({ success: true, data: updatedChecklist })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
