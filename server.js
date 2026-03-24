require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");

const app = express();

app.set("trust proxy", 1);
// ---------------------- GENERAL REQUEST LOGGER ----------------------
app.use((req, res, next) => {
  console.log(`📌 Incoming Request: ${req.method} ${req.url}`);
  console.log("Headers:", req.headers);
  next();
});

// ---------------------- CORS ----------------------
app.use(cors({
  origin: process.env.FRONTEND_URL, // Vercel frontend
  credentials: true
}));

// ---------------------- JSON PARSER ----------------------
app.use(express.json());

// ---------------------- SESSION ----------------------
app.use(session({
  secret: process.env.SESSION_SECRET || "expense-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,           // HTTPS only
    httpOnly: true,
    sameSite: "none"        // cross-origin required
  }
}));
app.use(session({
  secret: process.env.SESSION_SECRET || "expense-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: "none"
  }
}));

// ---------------------- PASSPORT ----------------------
app.use(passport.initialize());
app.use(passport.session());

// ---------------------- STATIC FILES ----------------------


// ---------------------- PASSPORT GOOGLE STRATEGY ----------------------
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, (accessToken, refreshToken, profile, done) => {
  console.log("🔹 Google profile received:", profile);
  return done(null, profile);
}));

passport.serializeUser((user, done) => {
  console.log("💾 serializeUser called:", user);
  done(null, user);
});

passport.deserializeUser((user, done) => {
  console.log("💾 deserializeUser called:", user);
  done(null, user);
});

// ---------------------- ROUTES ----------------------
app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect("/dashboard");
  }
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// ---------------------- GOOGLE AUTH ----------------------
app.get("/auth/google", (req, res, next) => {
  console.log("🔹 Google login triggered");
  console.log("Cookies received:", req.headers.cookie);
  next();
}, passport.authenticate("google", { scope: ["profile", "email"] }));

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    console.log("🔹 Google callback triggered");
    console.log("Cookies received:", req.headers.cookie);
    console.log("User object:", req.user);
    // Redirect to frontend dashboard
    res.redirect("/dashboard");
  }
);

app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect(process.env.FRONTEND_URL);
  });
});

// ---------------------- AUTH MIDDLEWARE ----------------------
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
}

// ---------------------- DASHBOARD ----------------------
app.get("/dashboard", ensureAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});


// ---------------------- MONGOOSE SETUP ----------------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("MongoDB Error:", err));

// ---------------------- EXPENSE MODEL ----------------------
const expenseSchema = new mongoose.Schema({
  title: String,
  amount: Number,
  category: String,
  date: String,
  userId: String,
});

const Expense = mongoose.model("Expense", expenseSchema);

// ---------------------- EXPENSE ROUTES ----------------------
app.get("/expenses", ensureAuth, async (req, res) => {
  const expenses = await Expense.find({ userId: req.user.id || req.user._json.sub });
  res.json(expenses);
});

app.post("/expenses", ensureAuth, async (req, res) => {
  const expense = new Expense({
    ...req.body,
    userId: req.user.id || req.user._json.sub
  });
  await expense.save();
  res.json(expense);
});

app.delete("/expenses/:id", ensureAuth, async (req, res) => {
  await Expense.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted successfully" });
});

app.put("/expenses/:id", ensureAuth, async (req, res) => {
  await Expense.findByIdAndUpdate(req.params.id, req.body);
  res.json({ message: "Updated successfully" });
});

// ---------------------- ERROR HANDLER ----------------------
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.stack);
  res.status(500).send({ error: err.message });
});

app.use(express.static(path.join(__dirname, "public")));

// ---------------------- START SERVER ----------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});