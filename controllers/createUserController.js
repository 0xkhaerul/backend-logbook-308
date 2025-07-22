const { prisma } = require("../config/db");
const bcrypt = require("bcrypt");

const createUser = async (req, res) => {
  try {
    const { nama_lengkap, email, password } = req.body;

    if (!nama_lengkap || !email || !password) {
      return res
        .status(400)
        .json({ message: "Nama lengkap, Email, and Password are required" });
    }

    // Cek apakah email sudah terdaftar
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Buat user baru
    const user = await prisma.user.create({
      data: {
        nama_lengkap,
        email,
        password: hashedPassword,
      },
    });

    // Hapus password dari response
    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      message: "User created successfully",
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res
      .status(500)
      .json({ message: "Error creating user", error: error.message });
  }
};

const getProfile = async (req, res) => {
  try {
    // Menggunakan user ID dari token yang sudah diverifikasi oleh middleware
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        nama_lengkap: true,
        email: true,
        image_profile_url: true,
        created_at: true,
        // Tidak mengambil password untuk keamanan
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Profile retrieved successfully",
      user: user,
    });
  } catch (error) {
    console.error("Error retrieving profile:", error);
    res
      .status(500)
      .json({ message: "Error retrieving profile", error: error.message });
  }
};

module.exports = { createUser, getProfile };
