import { v2 as cloudinary } from "cloudinary";
import config from "./config.js";
cloudinary.config({
  cloud_name: config.CLOUDIANRY_CLOUD_NAME,
  api_key: config.CLOUDIANRY_API_KEY,
  api_secret: config.CLOUDINARY_SECRET_KEY
});

export default cloudinary;