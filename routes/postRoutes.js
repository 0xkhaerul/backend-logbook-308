const express = require("express");
const {
  upload,
  createPost,
  getAllPosts,
  getPostById,
  deletePost,
} = require("../controllers/postController/postController");

const router = express.Router();

router.get("/posts", getAllPosts);

router.get("/posts/:id", getPostById);

// Ubah dari upload.single menjadi upload.array untuk multiple files
// Maksimal 10 files per post
router.post("/posts", upload.array("files", 10), createPost);

router.delete("/posts/:id", deletePost);

module.exports = router;
