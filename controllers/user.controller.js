// controllers/userController.js

import User from "../models/user.model.js";

export const syncUser = async (req, res, next) => {
  try {
    const { clerkId, email, name, imageUrl } = req.body;

    let user = await User.findOne({ clerkId });

    if (!user) {
      user = await User.create({
        clerkId,
        email,
        name,
        imageUrl
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

//get current user 
export const getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: req.user
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { name, imageUrl } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, imageUrl },
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};