const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
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
// Send verification email
router.post("/send-verification", async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Not authenticated" });
  const user = await User.findById(req.user._id);
  if (user.verified)
    return res.status(400).json({ message: "Already verified" });
  if (!user.email) return res.status(400).json({ message: "No email found" });
  const email = user.email;
  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1d" });
  const verifyUrl = `${VERIFY_EMAIL_URL_BASE}/${token}`;
  const htmlContent = `<div style="font-family:sans-serif;text-align:center;padding:2em;">
    <h2>Verify your email for DoDaily</h2>
    <p>Click the button below to verify your email address and unlock all features.</p>
    <a href="${verifyUrl}" style="display:inline-block;padding:1em 2em;background:#0d7a76;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Verify Email</a>
    <p style="margin-top:1.5em;font-size:13px;color:#4f6664;word-break:break-word;">If the button does not open, use this link:<br/>${verifyUrl}</p>
    <p style="margin-top:2em;font-size:12px;color:#888;">If you did not request this, you can ignore this email.</p>
  </div>`;
  try {
    await sendBrevoMail({
      to: email,
      subject: "Verify your email for DoDaily",
      htmlContent,
    });
    res.json({ message: "Verification email sent" });
  } catch (e) {
    res.status(500).json({ message: "Failed to send email", error: e.message });
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

      return res.status(201).json({
        id: registeredUser._id,
        username: registeredUser.username,
        displayName: registeredUser.displayName,
        email: registeredUser.email || "",
        verified: registeredUser.verified,
      });
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

      return res.json({
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        email: user.email || "",
        verified: user.verified,
      });
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

router.get("/me", (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Not logged in" });
  }

  return res.json({
    id: req.user._id,
    username: req.user.username,
    displayName: req.user.displayName,
    email: req.user.email || "",
    verified: req.user.verified,
  });
});

router.patch("/me", async (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Not logged in" });
  }

  const displayName = (req.body.displayName || "").trim();
  const email = (req.body.email || "").trim();

  if (!displayName && !email) {
    return res
      .status(400)
      .json({ message: "displayName or email is required" });
  }
  if (displayName) req.user.displayName = displayName;
  if (email) {
    req.user.email = email;
    req.user.verified = false; // Reset verification if email changes
  }
  await req.user.save();

  return res.json({
    id: req.user._id,
    username: req.user.username,
    displayName: req.user.displayName,
    email: req.user.email,
    verified: req.user.verified,
  });
});

module.exports = router;
