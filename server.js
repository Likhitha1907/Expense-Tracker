const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");

const app = express();

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

app.use(session({
  secret: "expense-secret",
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname, "public")));


// ===== GOOGLE AUTH =====
passport.use(new GoogleStrategy({
  clientID: "97007693508-sc0p2fq9aofbeq5vbucgvgs0ihnpf56e.apps.googleusercontent.com",
  clientSecret: "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",
  callbackURL: "http://localhost:5000/auth/google/callback"
},
(accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));


// ===== LOGIN PAGE =====
app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect("/dashboard");
  }
  res.sendFile(path.join(__dirname, "public", "login.html"));
});


// ===== GOOGLE LOGIN =====
app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("/dashboard");
  }
);


// ===== LOGOUT =====
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});


// ===== AUTH CHECK =====
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
}


// ===== DASHBOARD PAGE =====
app.get("/dashboard", ensureAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});


// ===== MONGODB =====
mongoose.connect("mongodb://127.0.0.1:27017/expenseDB")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));


// ===== SCHEMA =====
const expenseSchema = new mongoose.Schema({
  title: String,
  amount: Number,
  category: String,
  date: String,
  userId: String
});

const Expense = mongoose.model("Expense", expenseSchema);


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


// ===== START SERVER =====
app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});