import File from "../models/file.model.js"

export const uploadFileInitial = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

    // Return the Cloudinary info to the frontend for the dialogue pre-fill
    res.status(200).json({
      success: true,
      data: {
        url: req.file.path,
        public_id: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      }
    });
  } catch (error) {
    next(error);
  }
};

export const finalizeFileRecord = async (req, res) => {
  try {
    const { 
      tripId, 
      name, 
      category, 
      notes, 
      url, 
      public_id, 
      fileType, 
      size 
    } = req.body;
    console.log(req.body);

    const fileExtension = name.split('.').pop();

    const newFile = await File.create({
      tripId,
      uploadedBy: req.user._id,
      name,
      category,
      notes,
      url,
      public_id,
      fileType,
      fileExtension,
      size
    });

    // Populate user info (name/image) for the UI cards
    const populatedFile = await newFile.populate("uploadedBy", "name imageUrl");

    res.status(201).json({ success: true, data: populatedFile });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTripFiles = async (req, res) => {
  try {
    const { tripId } = req.params;

    // Find all files for this trip and sort by newest first
    const files = await File.find({ tripId })
      .populate("uploadedBy", "name imageUrl") // Required for the avatars in your design
      .sort({ createdAt: -1 });

    if (!files) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    res.status(200).json({
      success: true,
      count: files.length,
      data: files,
    });
  } catch (error) {
    console.error("Error fetching trip files:", error);
    res.status(500).json({
      success: false,
      message: "Could not retrieve files for this trip",
    });
  }
};