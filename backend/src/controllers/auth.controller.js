const User = require('../models/User');
const jwt = require('jsonwebtoken');

// FUNCIÓN DE REGISTRO (SIGNUP)
exports.signup = async (req, res) => {
  try {
    const { username, password } = req.body;
    const email = req.body.email ? req.body.email.trim().toLowerCase() : "";

    // 1. Validar que lleguen los datos
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
    }

    // 2. Verificar si el usuario ya existe para evitar duplicados
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "Este correo ya está registrado" });
    }

    // 3. Crear el nuevo usuario (La contraseña se encripta en el modelo)
    const newUser = new User({
      username,
      email,
      password
    });

    await newUser.save();

    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: "30d" });

    // 4. Respuesta de éxito total para el Frontend
    return res.status(201).json({
      success: true,
      message: "¡Cuenta creada! Ya puedes iniciar sesión.",
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email
      }
    });

  } catch (error) {
    console.error("❌ ERROR EN EL SERVIDOR (Signup):", error.message);

    if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0];
      if (field === "username") {
        return res.status(400).json({ message: "Ese nombre de usuario ya está en uso" });
      }
      return res.status(400).json({ message: "Ya existe una cuenta con esos datos" });
    }

    // IMPORTANTE: Esto evita que el frontend se quede esperando y de error de conexión
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};
