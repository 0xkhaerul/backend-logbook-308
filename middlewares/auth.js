const jwt = require("jsonwebtoken");
const { prisma } = require("../config/db");

const verifyToken = async (req, res, next) => {
  try {
    // Ambil token dari header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: "Access token is required",
      });
    }

    // Format: "Bearer <token>"
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        message: "Access token is required",
      });
    }

    // Verifikasi token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );

    // Cek apakah user masih ada di database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        nama_lengkap: true,
        image_profile_url: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid token - user not found",
      });
    }

    // Attach user data ke request object
    req.user = user;
    next();
  } catch (error) {
    console.error("Token verification error:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        message: "Invalid token",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Token expired",
      });
    }

    return res.status(500).json({
      message: "Token verification failed",
      error: error.message,
    });
  }
};

module.exports = { verifyToken };
