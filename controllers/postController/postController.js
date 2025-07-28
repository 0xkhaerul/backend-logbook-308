const { prisma } = require("../../config/db");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const jwt = require("jsonwebtoken");
const sharp = require("sharp"); // Tambahkan sharp untuk image processing

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

// Helper function untuk kompres dan resize gambar
const compressImage = async (buffer, mimetype, filename) => {
  try {
    // Hanya proses jika file adalah gambar
    if (!mimetype.startsWith("image/")) {
      return { buffer, mimetype, filename };
    }

    // Skip compression untuk GIF (animated images)
    if (mimetype === "image/gif") {
      return { buffer, mimetype, filename };
    }

    // Konfigurasi kompresi berdasarkan ukuran file
    const originalSize = buffer.length;
    let quality = 85;
    let maxWidth = 1920;
    let maxHeight = 1080;

    // Adjust quality based on file size
    if (originalSize > 5 * 1024 * 1024) {
      // > 5MB
      quality = 70;
      maxWidth = 1600;
      maxHeight = 900;
    } else if (originalSize > 2 * 1024 * 1024) {
      // > 2MB
      quality = 75;
      maxWidth = 1800;
      maxHeight = 1000;
    }

    // Proses dengan Sharp
    let sharpInstance = sharp(buffer).resize(maxWidth, maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    });

    // Set format dan quality berdasarkan tipe file
    if (mimetype === "image/png") {
      sharpInstance = sharpInstance.png({
        quality: quality,
        compressionLevel: 8,
      });
    } else {
      // Convert to JPEG for better compression
      sharpInstance = sharpInstance.jpeg({
        quality: quality,
        progressive: true,
        mozjpeg: true,
      });
      mimetype = "image/jpeg";
      filename = filename.replace(/\.(png|webp)$/i, ".jpg");
    }

    const compressedBuffer = await sharpInstance.toBuffer();

    // Log compression results
    const compressionRatio = (
      ((originalSize - compressedBuffer.length) / originalSize) *
      100
    ).toFixed(2);
    console.log(`Image compressed: ${filename}`);
    console.log(`Original size: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(
      `Compressed size: ${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB`
    );
    console.log(`Compression ratio: ${compressionRatio}%`);

    return {
      buffer: compressedBuffer,
      mimetype: mimetype,
      filename: filename,
    };
  } catch (error) {
    console.error("Error compressing image:", error);
    // Return original if compression fails
    return { buffer, mimetype, filename };
  }
};

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
      // Tambahan optimisasi untuk Cloudinary
      transformation: [
        {
          quality: "auto:good",
          fetch_format: "auto",
        },
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

// Helper function untuk upload multiple files dengan kompresi
const uploadMultipleFiles = async (files) => {
  try {
    // Step 1: Compress all images
    console.log(`Starting compression for ${files.length} files...`);
    const compressionPromises = files.map((file) =>
      compressImage(file.buffer, file.mimetype, file.originalname)
    );

    const compressedFiles = await Promise.all(compressionPromises);

    // Step 2: Upload compressed files to Cloudinary
    console.log("Starting upload to Cloudinary...");
    const uploadPromises = compressedFiles.map((file) =>
      uploadToCloudinary(file.buffer, file.mimetype, file.filename)
    );

    const results = await Promise.all(uploadPromises);
    console.log(`Successfully uploaded ${results.length} files to Cloudinary`);

    return results;
  } catch (error) {
    console.error("Error in uploadMultipleFiles:", error);
    throw error;
  }
};

// Batch processing untuk file besar
const uploadFilesInBatches = async (files, batchSize = 3) => {
  const results = [];

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
        files.length / batchSize
      )}`
    );

    try {
      const batchResults = await uploadMultipleFiles(batch);
      results.push(...batchResults);

      // Small delay between batches to avoid overwhelming the server
      if (i + batchSize < files.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(
        `Error processing batch ${Math.floor(i / batchSize) + 1}:`,
        error
      );
      throw error;
    }
  }

  return results;
};

// Create Post dengan Multiple Images dan Kompresi
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

    // Upload files jika ada dengan batch processing
    if (req.files && req.files.length > 0) {
      try {
        console.log(`Processing ${req.files.length} files...`);

        // Calculate total size before processing
        const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
        console.log(
          `Total file size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`
        );

        // Use batch processing for files > 6 or total size > 20MB
        if (req.files.length > 6 || totalSize > 20 * 1024 * 1024) {
          uploadedFiles = await uploadFilesInBatches(req.files, 3);
        } else {
          uploadedFiles = await uploadMultipleFiles(req.files);
        }

        console.log(`Successfully processed all ${uploadedFiles.length} files`);
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
          cloudinaryId: file.public_id,
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
      uploadInfo: {
        totalFiles: uploadedFiles.length,
        processedFiles: uploadedFiles.length,
      },
    });
  } catch (error) {
    console.error("Error creating post:", error);

    // Hapus files dari cloudinary jika ada error database
    if (uploadedFiles.length > 0) {
      console.log("Cleaning up uploaded files due to error...");
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
