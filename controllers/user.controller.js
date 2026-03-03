// controllers/userController.js

import User from "../models/user.model.js"
import { clerkClient } from "@clerk/express";
export const syncUser = async (req, res) => {
  try {

    const { userId } = req.auth();
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
