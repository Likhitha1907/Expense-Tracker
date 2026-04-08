// ===== LOAD ENV VARIABLES =====
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

// ===== CORS =====
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, "");
    if (allowedOrigins.includes(normalized)) return callback(null, true);
    callback(null, false);
  },
  credentials: true
}));

// ===== MIDDLEWARE =====
app.use(express.json());
app.set("trust proxy", 1);

// ===== SESSION =====
app.use(session({
  secret: process.env.SESSION_SECRET || "expense-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax"
  }
}));

// ===== PASSPORT =====
app.use(passport.initialize());
app.use(passport.session());

// ===== STATIC FILES =====
app.use(express.static(path.join(__dirname, "public")));

// ===== GOOGLE STRATEGY =====
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
  proxy: true
},
(accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ===== ROUTES =====

// LOGIN PAGE
app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect("/dashboard"); // ✅ FIXED
  }
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// GOOGLE LOGIN
app.get("/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"]
  })
);

// GOOGLE CALLBACK
app.get("/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/"
  }),
  (req, res) => {
    res.redirect("/dashboard"); // ✅ FIXED
  }
);

// LOGOUT
app.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});

// AUTH CHECK
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
}

// DASHBOARD
app.get("/dashboard", ensureAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// ===== DATABASE =====
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

// ===== API ROUTES =====

// GET
app.get("/expenses", ensureAuth, async (req, res) => {
  const expenses = await Expense.find({ userId: req.user.id });
  res.json(expenses);
});

// ADD
app.post("/expenses", ensureAuth, async (req, res) => {
  const expense = new Expense({
    ...req.body,
    userId: req.user.id
  });

  await expense.save();
  res.json(expense);
});

// DELETE
app.delete("/expenses/:id", ensureAuth, async (req, res) => {
  await Expense.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted successfully" });
});

// UPDATE
app.put("/expenses/:id", ensureAuth, async (req, res) => {
  await Expense.findByIdAndUpdate(req.params.id, req.body);
  res.json({ message: "Updated successfully" });
});

// ===== SERVER =====
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});