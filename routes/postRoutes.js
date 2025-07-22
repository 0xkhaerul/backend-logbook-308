const express = require("express");
const {
  upload,
  createPost,
  getAllPosts,
  getPostById,
  updatePost,
  deletePost,
} = require("../controllers/postController/postController");

const router = express.Router();

// Routes untuk Post

// GET - Ambil semua posts dengan pagination
// Query params: ?page=1&limit=10
router.get("/posts", getAllPosts);

// GET - Ambil post berdasarkan ID
router.get("/posts/:id", getPostById);

// POST - Buat post baru dengan optional file upload
// Body: { content, userId } + optional file (image/video)
router.post("/posts", upload.single("file"), createPost);

// PUT - Update post berdasarkan ID
// Body: { content, userId } + optional file (image/video)
router.put("/posts/:id", upload.single("file"), updatePost);

// DELETE - Hapus post berdasarkan ID
// Body: { userId }
router.delete("/posts/:id", deletePost);

module.exports = router;
