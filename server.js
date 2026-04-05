// ===== LOAD ENV VARIABLES =====
// This loads values from .env file into process.env
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");

const app = express();

const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

// =====================================================
// ===== MIDDLEWARE CONFIGURATION =======================
// =====================================================

// CORS: support comma-separated FRONTEND_URL (e.g. Vercel prod + preview)
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) {
      if (isProduction) {
        console.warn("FRONTEND_URL is unset; set it in production so your frontend can call this API.");
      }
      return callback(null, !isProduction);
    }
    const normalized = origin.replace(/\/$/, "");
    if (allowedOrigins.includes(normalized)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

// Parse JSON request bodies
app.use(express.json());

app.set("trust proxy", 1);
// ===== SESSION CONFIGURATION =====
// This is required for login persistence (user stays logged in)
app.use(session({
  secret: process.env.SESSION_SECRET || "expense-secret", // keep secret safe
  resave: false,
  saveUninitialized: false,

  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax"
  }
}));


// Initialize Passport (authentication middleware)
app.use(passport.initialize());
app.use(passport.session());


// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, "public")));


// =====================================================
// ===== GOOGLE AUTH STRATEGY ===========================
// =====================================================

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,           // from Google Cloud
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,   // from Google Cloud
  callbackURL: process.env.GOOGLE_CALLBACK_URL,    // must match Google console exactly (https, path, no stray slash)
  proxy: true
},
(accessToken, refreshToken, profile, done) => {
  // This function runs after successful Google login

  // profile contains user info from Google
  // (name, email, id, etc.)

  return done(null, profile);
}));


// ===== SESSION SERIALIZATION =====
// Stores user data in session
passport.serializeUser((user, done) => {
  done(null, user);
});

// Retrieves user from session
passport.deserializeUser((user, done) => {
  done(null, user);
});


// =====================================================
// ===== ROUTES =========================================
// =====================================================

// ===== LOGIN PAGE =====
app.get("/", (req, res) => {
  // If already logged in, go to dashboard
  if (req.isAuthenticated()) {
    return res.redirect("/dashboard");
  }

  // Otherwise show login page
  res.sendFile(path.join(__dirname, "public", "login.html"));
});


// ===== GOOGLE LOGIN START =====
// This route redirects user to Google login page
app.get("/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"]
  })
);

// ===== GOOGLE CALLBACK =====
// Google redirects here after login
app.get("/auth/google/callback", (req, res, next) => {
  if (req.query.error) {
    const detail = req.query.error_description || req.query.error;
    console.error("Google OAuth callback error:", detail);
    const base = allowedOrigins[0] || "";
    if (base) {
      return res.redirect(`${base}/?auth_error=${encodeURIComponent(String(req.query.error))}`);
    }
    return res.redirect("/?auth_error=1");
  }
  next();
},
  passport.authenticate("google", {
    failureRedirect: "/"
  }),
  (req, res) => {
    // On success, redirect to dashboard
    res.redirect("/dashboard");
  }
);


// ===== LOGOUT =====
app.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});


// ===== AUTH MIDDLEWARE =====
// Protects routes (only logged-in users can access)
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
}


// ===== DASHBOARD =====
app.get("/dashboard", ensureAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});


// =====================================================
// ===== DATABASE CONNECTION ============================
// =====================================================

// Connect to MongoDB Atlas (NOT localhost in production)
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("MongoDB Error:", err));


// ===== SCHEMA =====
const expenseSchema = new mongoose.Schema({
  title: String,
  amount: Number,
  category: String,
  date: String,
  userId: String
});

const Expense = mongoose.model("Expense", expenseSchema);


// =====================================================
// ===== API ROUTES =====================================
// =====================================================

// ===== GET EXPENSES =====
app.get("/expenses", ensureAuth, async (req, res) => {
  const expenses = await Expense.find({ userId: req.user.id });
  res.json(expenses);
});


// ===== ADD EXPENSE =====
app.post("/expenses", ensureAuth, async (req, res) => {
  const expense = new Expense({
    ...req.body,
    userId: req.user.id
  });

  await expense.save();
  res.json(expense);
});


// ===== DELETE EXPENSE =====
app.delete("/expenses/:id", ensureAuth, async (req, res) => {
  await Expense.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted successfully" });
});


// ===== UPDATE EXPENSE =====
app.put("/expenses/:id", ensureAuth, async (req, res) => {
  await Expense.findByIdAndUpdate(req.params.id, req.body);
  res.json({ message: "Updated successfully" });
});


// =====================================================
// ===== START SERVER ==================================
// =====================================================

const PORT = process.env.PORT || 5000;

if (isProduction && process.env.GOOGLE_CALLBACK_URL && !/^https:\/\//i.test(process.env.GOOGLE_CALLBACK_URL)) {
  console.warn("GOOGLE_CALLBACK_URL should use https:// in production (Google requires HTTPS redirect URIs).");
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});