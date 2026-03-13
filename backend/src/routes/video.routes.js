const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware.js");
const {
  getVideos,
  getVideo,
  createVideo,
  updateVideo,
  deleteVideo,
} = require("../controllers/video.controller.js");

const router = Router();

const videoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

router.get("/", videoLimiter, getVideos);
router.get("/:id", videoLimiter, verifyToken, getVideo);
router.post("/", videoLimiter, verifyToken, createVideo);
router.patch("/:id", videoLimiter, verifyToken, updateVideo);
router.delete("/:id", videoLimiter, verifyToken, deleteVideo);

module.exports = router;
