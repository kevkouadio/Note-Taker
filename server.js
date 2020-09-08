// Dependencies
// =============================================================
const express = require("express");
const path = require("path");
const db = require("./db/db")

// Sets up the Express App
// =============================================================
var app = express();
var PORT = 3030;

// Sets up the Express app to handle data parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes
// =============================================================

// Basic route that sends the user first to the AJAX Page
app.get("/notes", function(req, res) {
    res.sendFile(path.join(__dirname, "./public/notes.html"));
  });

app.get("*", function(req, res) {
    res.sendFile(path.join(__dirname, "./public/index.html"));
  });



// Starts the server to begin listening
// =============================================================
app.listen(PORT, function() {
    console.log("App listening on PORT " + PORT);
  });
