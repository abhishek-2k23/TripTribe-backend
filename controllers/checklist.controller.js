import Checklist from "../models/checklist.model.js";

export const bulkAddChecklistItems = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const { categoryName, itemNames } = req.body; // itemNames is an array: ["Passport", "Tickets"]

    if (!Array.isArray(itemNames) || itemNames.length === 0) {
      return res.status(400).json({ success: false, message: "Please provide an array of items." });
    }

    let checklist = await Checklist.findOne({ tripId });

    

    // 1. If no checklist exists for trip, create it with the bulk items
    if (!checklist) {
      const newItems = itemNames.map(name => ({ title: name }));
      checklist = new Checklist({ 
        tripId, 
        categories: [{ name: categoryName, items: newItems }] 
      });
      await checklist.save();
      return res.status(201).json({ success: true, data: checklist });
    }

    // 2. Find existing category
    let category = checklist.categories.find(
      (cat) => cat.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (category) {
      // 3. Filter out items that already exist in this category (case-insensitive)
      const existingTitles = category.items.map(i => i.title.toLowerCase());
      const uniqueNewItems = itemNames
        .filter(name => !existingTitles.includes(name.toLowerCase()))
        .map(name => ({ title: name }));

      if (uniqueNewItems.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: "All provided items already exist in this category." 
        });
      }

      // 4. Add only the unique items
      category.items.push(...uniqueNewItems);
    } else {
      // 5. Create new category with all provided items
      checklist.categories.push({ 
        name: categoryName, 
        items: itemNames.map(name => ({ title: name })) 
      });
    }

    await checklist.save();
    res.status(200).json({ success: true, data: checklist });

  } catch (error) {
    next(error);
  }
};

export const addItemToCategory = async (req, res, next) => {
  try {
    const { tripId, categoryId } = req.params;
    const { title } = req.body;

    const checklist = await Checklist.findOneAndUpdate(
      { tripId, "categories._id": categoryId },
      { $push: { "categories.$.items": { title } } },
      { new: true }
    );

    res.status(200).json({ success: true, data: checklist });
  } catch (error) {
    next(error);
  }
};

// 3. Toggle Item Completion (The avatar sync logic)
export const toggleItem = async (req, res) => {
  try {
    const { tripId, categoryId, itemId } = req.params;
    const { isCompleted } = req.body;
    const userId = req.user._id; // From your auth middleware

    const checklist = await Checklist.findOneAndUpdate(
      { 
        tripId, 
        "categories._id": categoryId, 
        "categories.items._id": itemId 
      },
      { 
        $set: { 
          "categories.$[cat].items.$[itm].isCompleted": isCompleted,
          "categories.$[cat].items.$[itm].completedBy": isCompleted ? userId : null 
        } 
      },
      { 
        arrayFilters: [{ "cat._id": categoryId }, { "itm._id": itemId }],
        new: true 
      }
    ).populate("categories.items.completedBy", "name imageUrl");

    res.status(200).json({ success: true, data: checklist });
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
        select: "name imageUrl", // Only fetch necessary fields
      });

    if (!checklist) {
      return res.status(200).json({ 
        success: true, 
        data: { categories: [] } 
      });
    }

    res.status(200).json({
      success: true,
      data: checklist,
    });
  } catch (error) {
    console.error("Fetch Checklist Error:", error);
    next(error);
  }
};

export const updateChecklistOrItem = async (req, res) => {
  try {
    const { tripId, categoryId } = req.params;
    const { newCategoryName, itemId, newItemName } = req.body;

    let updateQuery = {};
    let arrayFilters = [];

    // Case 1: Updating an Item Title
    if (itemId && newItemName) {
      updateQuery = { $set: { "categories.$[cat].items.$[itm].title": newItemName } };
      arrayFilters = [{ "cat._id": categoryId }, { "itm._id": itemId }];
    } 
    // Case 2: Updating the Category Name
    else if (newCategoryName) {
      updateQuery = { $set: { "categories.$.name": newCategoryName } };
    }

    const updatedChecklist = await Checklist.findOneAndUpdate(
      { tripId, "categories._id": categoryId },
      updateQuery,
      { 
        arrayFilters: arrayFilters.length > 0 ? arrayFilters : undefined,
        new: true 
      }
    ).populate("categories.items.completedBy", "name imageUrl");

    res.status(200).json({ success: true, data: updatedChecklist });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};