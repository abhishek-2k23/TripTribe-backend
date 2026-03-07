import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    console.log("Multer is sending file to Cloudinary:", file.originalname);
    return {
      folder: "TripTribe",
      resource_type: "auto", // IMPORTANT → allows image, pdf, docs
      public_id: Date.now() + "-" + file.originalname,
    };
  },
});

const upload = multer({ storage });

export default upload;