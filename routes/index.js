const express = require("express");
const authRoutes = require("./authRoutes");
const postRoutes = require("./postRoutes");

const router = express.Router();

// kumpulan routes
router.use("/", authRoutes);
router.use("/", postRoutes);

module.exports = router;
