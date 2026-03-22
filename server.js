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


// =====================================================
// ===== MIDDLEWARE CONFIGURATION =======================
// =====================================================

// Enable CORS (IMPORTANT for Vercel frontend → Render backend)
app.use(cors({
  origin: process.env.FRONTEND_URL, // your Vercel URL
  credentials: true                // allow cookies/session
}));

// Parse JSON request bodies
app.use(express.json());


// ===== SESSION CONFIGURATION =====
// This is required for login persistence (user stays logged in)
app.use(session({
  secret: process.env.SESSION_SECRET || "expense-secret", // keep secret safe
  resave: false,
  saveUninitialized: false,

  cookie: {
    secure: true,        // REQUIRED for HTTPS (Render uses HTTPS)
    sameSite: "none"     // REQUIRED for cross-site (Vercel ↔ Render)
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
  callbackURL: process.env.GOOGLE_CALLBACK_URL      // must match Google console
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
app.get("/auth/google/callback",
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
