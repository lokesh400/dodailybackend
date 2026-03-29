const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const isAuthenticated = require("../middleware/isAuthenticated");
const sendBrevoMail = require("../utils/sendBrevoMail");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "verify-secret";
const SERVER_PUBLIC_URL = (
  process.env.SERVER_PUBLIC_URL || "https://dodaily.onrender.com"
).replace(/\/+$/, "");
const VERIFY_EMAIL_URL_BASE =
  process.env.VERIFY_EMAIL_URL_BASE ||
  `${SERVER_PUBLIC_URL}/api/auth/user/verify/user`;
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "dodaily.sid";

function formatAuthUser(user) {
  return {
    id: user._id,
    username: user.username,
    displayName: user.displayName,
    email: user.email || "",
    verified: Boolean(user.verified),
  };
}
// Send verification email
router.post("/send-verification", isAuthenticated, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.verified) {
      return res.status(400).json({ message: "Already verified" });
    }

    if (!user.email) {
      return res.status(400).json({ message: "No email found" });
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1d" });
    const verifyUrl = `${VERIFY_EMAIL_URL_BASE}/${token}`;
    const htmlContent = `<div style="font-family:sans-serif;text-align:center;padding:2em;">
      <h2>Verify your email for DoDaily</h2>
      <p>Click the button below to verify your email address and unlock all features.</p>
      <a href="${verifyUrl}" style="display:inline-block;padding:1em 2em;background:#0d7a76;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Verify Email</a>
      <p style="margin-top:1.5em;font-size:13px;color:#4f6664;word-break:break-word;">If the button does not open, use this link:<br/>${verifyUrl}</p>
      <p style="margin-top:2em;font-size:12px;color:#888;">If you did not request this, you can ignore this email.</p>
    </div>`;

    await sendBrevoMail({
      to: user.email,
      subject: "Verify your email for DoDaily",
      htmlContent,
    });

    return res.json({ message: "Verification email sent" });
  } catch (error) {
    console.error("Error sending verification email:", error);
    return next(error);
  }
});

// Verify email by token
router.get("/user/verify/user/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(404).send("<h2>User not found</h2>");
    if (user.verified) return res.send("<h2>Email already verified!</h2>");
    user.verified = true;
    await user.save();
    // Beautiful confirmation page
    return res.send(`
      <div style="font-family:sans-serif;text-align:center;padding:3em;">
        <h1 style="color:#0d7a76;">🎉 Email Verified!</h1>
        <p style="font-size:18px;">Thank you for verifying your email.<br/>You can now use all features of DoDaily.</p>
      </div>
    `);
  } catch (e) {
    return res
      .status(400)
      .send("<h2>Invalid or expired verification link.</h2>");
  }
});

router.post("/register", async (req, res) => {
  try {
    const { username, password, displayName } = req.body;

    if (!username || !password || !displayName) {
      return res.status(400).json({
        message: "username, password and displayName are required",
      });
    }

    const registeredUser = await User.register(
      new User({ username, displayName }),
      password,
    );

    req.login(registeredUser, (err) => {
      if (err) {
        return res.status(500).json({ message: "Login after signup failed" });
      }

      return res.status(201).json(formatAuthUser(registeredUser));
    });
  } catch (error) {
    if (error.name === "UserExistsError") {
      return res.status(409).json({ message: "Username already exists" });
    }

    return res.status(500).json({
      message: "Could not register user",
      error: error.message,
    });
  }
});

router.post("/login", (req, res, next) => {
  passport.authenticate("local", (error, user) => {
    if (error) {
      return next(error);
    }

    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    return req.login(user, (loginError) => {
      if (loginError) {
        return next(loginError);
      }

      return res.json(formatAuthUser(user));
    });
  })(req, res, next);
});

router.post("/logout", (req, res, next) => {
  req.logout((error) => {
    if (error) {
      return next(error);
    }

    req.session.destroy((sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }

      res.clearCookie(SESSION_COOKIE_NAME);
      return res.json({ message: "Logged out successfully" });
    });
  });
});

router.get("/me", isAuthenticated, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(formatAuthUser(user));
  } catch (error) {
    return next(error);
  }
});

router.patch("/me", isAuthenticated, async (req, res, next) => {
  try {
    const hasDisplayName = Object.prototype.hasOwnProperty.call(
      req.body,
      "displayName",
    );
    const hasEmail = Object.prototype.hasOwnProperty.call(req.body, "email");
    const displayName = hasDisplayName
      ? String(req.body.displayName || "").trim()
      : "";
    const email = hasEmail
      ? String(req.body.email || "").trim().toLowerCase()
      : "";

    if ((!hasDisplayName || !displayName) && (!hasEmail || !email)) {
      return res
        .status(400)
        .json({ message: "displayName or email is required" });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (displayName) {
      user.displayName = displayName;
    }

    if (hasEmail) {
      if (!email) {
        return res.status(400).json({ message: "email is required" });
      }

      const emailChanged = user.email !== email;
      user.email = email;

      if (emailChanged) {
        user.verified = false;
      }
    }

    await user.save();

    return res.json(formatAuthUser(user));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
