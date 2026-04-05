const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const isAuthenticated = require("../middleware/isAuthenticated");
const sendBrevoMail = require("../utils/sendBrevoMail");
const {
  isExpoPushToken,
  normalizePushToken,
} = require("../utils/pushNotifications");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "verify-secret";
const SERVER_PUBLIC_URL = (
  process.env.SERVER_PUBLIC_URL || "https://dodaily.onrender.com"
).replace(/\/+$/, "");
const VERIFY_EMAIL_URL_BASE =
  process.env.VERIFY_EMAIL_URL_BASE ||
  `${SERVER_PUBLIC_URL}/api/auth/user/verify/user`;
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "dodaily.sid";
const RESET_PASSWORD_SECRET =
  process.env.RESET_PASSWORD_SECRET || JWT_SECRET;
const RESET_PASSWORD_TOKEN_TTL =
  process.env.RESET_PASSWORD_TOKEN_TTL || "1h";
const RESET_PASSWORD_URL_BASE =
  process.env.RESET_PASSWORD_URL_BASE ||
  `${SERVER_PUBLIC_URL}/api/auth/reset-password`;

function formatAuthUser(user) {
  return {
    id: user._id,
    username: user.username,
    displayName: user.displayName,
    email: user.email || "",
    verified: Boolean(user.verified),
  };
}

function getResetRequestIdentifier(body = {}) {
  const usernameOrEmail = String(body.usernameOrEmail || "").trim();
  const username = String(body.username || "").trim();
  const email = String(body.email || "").trim().toLowerCase();

  if (usernameOrEmail) {
    return usernameOrEmail;
  }

  if (username) {
    return username;
  }

  if (email) {
    return email;
  }

  return "";
}

function isEmailIdentifier(identifier) {
  return identifier.includes("@");
}

function buildResetPasswordToken(userId) {
  return jwt.sign({ id: userId, purpose: "password-reset" }, RESET_PASSWORD_SECRET, {
    expiresIn: RESET_PASSWORD_TOKEN_TTL,
  });
}

function resetPasswordMailHtml({ users, linksByUserId }) {
  const rows = users
    .map((user) => {
      const link = linksByUserId.get(String(user._id));
      return `<tr>
        <td style="padding:12px;border:1px solid #e7eceb;"><strong>${user.username}</strong></td>
        <td style="padding:12px;border:1px solid #e7eceb;">${user.displayName || "-"}</td>
        <td style="padding:12px;border:1px solid #e7eceb;"><a href="${link}" style="color:#0d7a76;font-weight:600;">Reset password</a></td>
      </tr>`;
    })
    .join("");

  return `<div style="font-family:sans-serif;line-height:1.5;color:#1d2b2a;">
    <h2 style="margin:0 0 10px;">Reset your DoDaily password</h2>
    <p style="margin:0 0 16px;">We received a password reset request for this email address.</p>
    <p style="margin:0 0 16px;">This email is linked to ${
      users.length
    } account${users.length > 1 ? "s" : ""}. Use the right link below:</p>
    <table style="border-collapse:collapse;width:100%;max-width:760px;margin:0 0 16px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:12px;border:1px solid #e7eceb;background:#f4f7f6;">Username</th>
          <th style="text-align:left;padding:12px;border:1px solid #e7eceb;background:#f4f7f6;">Display name</th>
          <th style="text-align:left;padding:12px;border:1px solid #e7eceb;background:#f4f7f6;">Reset link</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:0 0 12px;font-size:13px;color:#4f6664;">Each link expires soon for security.</p>
    <p style="margin:0;font-size:12px;color:#7a8785;">If you did not request this, you can ignore this email.</p>
  </div>`;
}

function shouldRenderHtml(req) {
  const contentType = String(req.headers["content-type"] || "");
  const accept = String(req.headers.accept || "");
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    accept.includes("text/html")
  );
}

async function applyNewPassword(user, password) {
  await new Promise((resolve, reject) => {
    user.setPassword(password, (error) => {
      if (error) {
        return reject(error);
      }

      return resolve();
    });
  });
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

router.post(["/forgot-password", "/request-password-reset"], async (req, res, next) => {
  try {
    const identifier = getResetRequestIdentifier(req.body);

    if (!identifier) {
      return res.status(400).json({ message: "Username or email is required" });
    }

    const emailMode = isEmailIdentifier(identifier);
    let targetUsers = [];
    let recipientEmail = "";

    if (emailMode) {
      recipientEmail = identifier.toLowerCase();
      targetUsers = await User.find({ email: recipientEmail }).select(
        "_id username displayName email",
      );
    } else {
      const user = await User.findOne({ username: identifier.toLowerCase() }).select(
        "_id username displayName email",
      );

      if (user?.email) {
        targetUsers = [user];
        recipientEmail = user.email;
      }
    }

    if (targetUsers.length > 0 && recipientEmail) {
      const linksByUserId = new Map();

      for (const user of targetUsers) {
        const token = buildResetPasswordToken(user._id);
        linksByUserId.set(
          String(user._id),
          `${RESET_PASSWORD_URL_BASE}/${encodeURIComponent(token)}`,
        );
      }

      await sendBrevoMail({
        to: recipientEmail,
        subject: "Reset your DoDaily password",
        htmlContent: resetPasswordMailHtml({ users: targetUsers, linksByUserId }),
      });
    }

    return res.json({
      message:
        "If the account exists, password reset instructions have been sent.",
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const payload = jwt.verify(token, RESET_PASSWORD_SECRET);

    if (payload.purpose !== "password-reset") {
      return res.status(400).send("<h2>Invalid reset token.</h2>");
    }

    const user = await User.findById(payload.id).select("username displayName");

    if (!user) {
      return res.status(404).send("<h2>User not found.</h2>");
    }

    return res.render("reset-password", {
      token,
      username: user.username,
      displayName: user.displayName || "",
      error: "",
      success: "",
      actionUrl: `/api/auth/reset-password/${encodeURIComponent(token)}`,
    });
  } catch (error) {
    return res.status(400).send("<h2>Invalid or expired reset link.</h2>");
  }
});

router.post("/reset-password/:token", async (req, res, next) => {
  const wantsHtml = shouldRenderHtml(req);
  const { token } = req.params;
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  const sendError = (statusCode, message, username = "", displayName = "") => {
    if (wantsHtml) {
      return res.status(statusCode).render("reset-password", {
        token,
        username,
        displayName,
        error: message,
        success: "",
        actionUrl: `/api/auth/reset-password/${encodeURIComponent(token)}`,
      });
    }

    return res.status(statusCode).json({ message });
  };

  try {
    const payload = jwt.verify(token, RESET_PASSWORD_SECRET);

    if (payload.purpose !== "password-reset") {
      return sendError(400, "Invalid reset token");
    }

    const user = await User.findById(payload.id);

    if (!user) {
      return sendError(404, "User not found");
    }

    if (!password || !confirmPassword) {
      return sendError(400, "Password and confirmPassword are required", user.username, user.displayName || "");
    }

    if (password !== confirmPassword) {
      return sendError(400, "Passwords do not match", user.username, user.displayName || "");
    }

    await applyNewPassword(user, password);
    await user.save();

    if (wantsHtml) {
      return res.render("reset-password", {
        token,
        username: user.username,
        displayName: user.displayName || "",
        error: "",
        success: "Your password has been reset successfully. You can close this page now.",
        actionUrl: `/api/auth/reset-password/${encodeURIComponent(token)}`,
      });
    }

    return res.json({ message: "Password reset successful" });
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      return sendError(400, "Invalid or expired reset token");
    }

    return next(error);
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

router.post("/push-token", isAuthenticated, async (req, res, next) => {
  try {
    const pushToken = normalizePushToken(req.body.pushToken);

    if (!isExpoPushToken(pushToken)) {
      return res.status(400).json({ message: "A valid Expo push token is required" });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { pushTokens: pushToken },
    });

    return res.json({ message: "Push token saved" });
  } catch (error) {
    return next(error);
  }
});

router.delete("/push-token", isAuthenticated, async (req, res, next) => {
  try {
    const pushToken = normalizePushToken(req.body.pushToken);

    if (!pushToken) {
      return res.status(400).json({ message: "pushToken is required" });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { pushTokens: pushToken },
    });

    return res.json({ message: "Push token removed" });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
