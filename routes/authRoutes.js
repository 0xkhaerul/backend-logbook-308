const express = require("express");
const {
  createUser,
  getProfile,
} = require("../controllers/createUserController");
const { loginUser } = require("../controllers/authController/login");
const { verifyToken } = require("../middlewares/auth");

const router = express.Router();

// create user
router.post("/users", createUser);

// login user
router.post("/login", loginUser);

// get profile (protected route)
router.get("/profile", verifyToken, getProfile);

module.exports = router;
