const { prisma } = require("../../config/db");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const jwt = require("jsonwebtoken");

// Helper function to get userId from token
const getUserIdFromToken = (req) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return null;

  const token = authHeader.split(" ")[1];
  if (!token) return null;

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );
    return decoded.id;
  } catch (error) {
    console.error("Error verifying token:", error);
    return null;
  }
};

// Konfigurasi Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Konfigurasi Multer dengan Memory Storage
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit per file
    files: 10, // Maximum 10 files
  },
  fileFilter: (req, file, cb) => {
    // Filter untuk file yang diizinkan
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webm/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(
        new Error(
          "File type not supported. Only images and videos are allowed."
        )
      );
    }
  },
});

// Helper function untuk upload ke Cloudinary
const uploadToCloudinary = (buffer, mimetype, filename) => {
  return new Promise((resolve, reject) => {
    let resourceType = "auto";
    let folder = "posts";

    // Tentukan resource type dan folder berdasarkan mimetype
    if (mimetype.startsWith("image/")) {
      resourceType = "image";
      folder = "posts/images";
    } else if (mimetype.startsWith("video/")) {
      resourceType = "video";
      folder = "posts/videos";
    }

    const uploadOptions = {
      resource_type: resourceType,
      folder: folder,
      public_id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${
        filename.split(".")[0]
      }`,
      allowed_formats: [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "mp4",
        "mov",
        "avi",
        "webm",
      ],
    };

    cloudinary.uploader
      .upload_stream(uploadOptions, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      })
      .end(buffer);
  });
};

// Helper function untuk upload multiple files
const uploadMultipleFiles = async (files) => {
  const uploadPromises = files.map((file) =>
    uploadToCloudinary(file.buffer, file.mimetype, file.originalname)
  );

  try {
    const results = await Promise.all(uploadPromises);
    return results;
  } catch (error) {
    throw error;
  }
};

// Create Post dengan Multiple Images
const createPost = async (req, res) => {
  let uploadedFiles = [];

  try {
    const { content } = req.body;
    const userId = getUserIdFromToken(req);

    // Validasi input
    if (!content || !userId) {
      return res.status(400).json({
        success: false,
        message: "Content is required and user must be authenticated",
      });
    }

    // Validasi user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Upload files jika ada
    if (req.files && req.files.length > 0) {
      try {
        uploadedFiles = await uploadMultipleFiles(req.files);
      } catch (uploadError) {
        console.error("Error uploading to cloudinary:", uploadError);
        return res.status(500).json({
          success: false,
          message: "Failed to upload files to cloudinary",
          error: uploadError.message,
        });
      }
    }

    // Simpan post ke database dengan transaction
    const newPost = await prisma.$transaction(async (tx) => {
      // Buat post
      const post = await tx.post.create({
        data: {
          content,
          userId: parseInt(userId),
        },
      });

      // Buat PostImage records jika ada file yang diupload
      if (uploadedFiles.length > 0) {
        const imageData = uploadedFiles.map((file) => ({
          imageUrl: file.secure_url,
          cloudinaryId: file.public_id, // Tambahkan cloudinary public_id
          postId: post.id,
        }));

        await tx.postImage.createMany({
          data: imageData,
        });
      }

      // Return post dengan relasi
      return await tx.post.findUnique({
        where: { id: post.id },
        include: {
          user: {
            select: {
              id: true,
              nama_lengkap: true,
              email: true,
              image_profile_url: true,
            },
          },
          images: true,
        },
      });
    });

    res.status(201).json({
      success: true,
      message: "Post created successfully",
      data: newPost,
    });
  } catch (error) {
    console.error("Error creating post:", error);

    // Hapus files dari cloudinary jika ada error database
    if (uploadedFiles.length > 0) {
      const deletePromises = uploadedFiles.map((file) =>
        cloudinary.uploader
          .destroy(file.public_id)
          .catch((err) =>
            console.error("Error deleting file from cloudinary:", err)
          )
      );
      await Promise.allSettled(deletePromises);
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get All Posts
const getAllPosts = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const posts = await prisma.post.findMany({
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: {
        created_at: "desc",
      },
      include: {
        user: {
          select: {
            id: true,
            nama_lengkap: true,
            email: true,
            image_profile_url: true,
          },
        },
        images: true, // Include images
      },
    });

    const totalPosts = await prisma.post.count();

    res.status(200).json({
      success: true,
      message: "Posts retrieved successfully",
      data: {
        posts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalPosts / limit),
          totalPosts,
          hasNext: skip + posts.length < totalPosts,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error getting posts:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get Post By ID
const getPostById = async (req, res) => {
  try {
    const { id } = req.params;

    const post = await prisma.post.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: {
          select: {
            id: true,
            nama_lengkap: true,
            email: true,
            image_profile_url: true,
          },
        },
        images: true,
      },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Post retrieved successfully",
      data: post,
    });
  } catch (error) {
    console.error("Error getting post:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete Post
const deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserIdFromToken(req);

    const existingPost = await prisma.post.findUnique({
      where: { id: parseInt(id) },
      include: {
        images: true,
      },
    });

    if (!existingPost) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Validasi ownership
    if (!userId || existingPost.userId !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own posts",
      });
    }

    // Hapus dengan transaction untuk memastikan consistency
    await prisma.$transaction(async (tx) => {
      // Hapus PostImage records terlebih dahulu
      if (existingPost.images.length > 0) {
        await tx.postImage.deleteMany({
          where: { postId: parseInt(id) },
        });
      }

      // Kemudian hapus Post
      await tx.post.delete({
        where: { id: parseInt(id) },
      });
    });

    // Hapus files dari cloudinary setelah database berhasil dihapus
    if (existingPost.images.length > 0) {
      const deletePromises = existingPost.images.map(async (image) => {
        try {
          // Gunakan cloudinaryId jika ada, jika tidak fallback ke extract dari URL
          const publicId =
            image.cloudinaryId || extractPublicId(image.imageUrl);
          if (publicId) {
            await cloudinary.uploader.destroy(publicId);
            console.log(
              `Successfully deleted image from cloudinary: ${publicId}`
            );
          }
        } catch (deleteError) {
          console.error("Error deleting file from cloudinary:", deleteError);
        }
      });

      // Tunggu semua file terhapus (atau error)
      await Promise.allSettled(deletePromises);
    }

    res.status(200).json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting post:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Helper function untuk extract public_id dari Cloudinary URL
const extractPublicId = (cloudinaryUrl) => {
  try {
    // Format URL cloudinary: https://res.cloudinary.com/cloud_name/resource_type/upload/folder/public_id.extension
    const parts = cloudinaryUrl.split("/");
    const uploadIndex = parts.indexOf("upload");
    if (uploadIndex !== -1 && uploadIndex < parts.length - 1) {
      // Ambil bagian setelah 'upload' dan gabungkan dengan '/'
      const pathAfterUpload = parts.slice(uploadIndex + 1).join("/");
      // Hilangkan extension
      return pathAfterUpload.replace(/\.[^/.]+$/, "");
    }

    // Fallback method
    const fileName = parts[parts.length - 1];
    return fileName.split(".")[0];
  } catch (error) {
    console.error("Error extracting public_id:", error);
    return null;
  }
};

module.exports = {
  upload,
  createPost,
  getAllPosts,
  getPostById,
  deletePost,
};
