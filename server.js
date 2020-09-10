// Dependencies
// =============================================================
const express = require("express");
const path = require("path");
const db = require("./db/db.json");
const fs = require("fs");

// Sets up the Express App
// =============================================================
var app = express();
var PORT = process.env.PORT || 8080;

// Sets up the Express app to handle data parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
// Routes
// =============================================================

// Basic route that sends the user first to the AJAX Page
app.get("/notes", function(req, res) {
    res.sendFile(path.join(__dirname, "public", "notes.html"));
  });

app.get("*", function(req, res) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

app.get("/api/notes", function(req, res) {
  fs.readFile(path.join(__dirname, "db", "db.json"), 'utf8', (err, jsonString) => {
    if (err) {
        console.log("File read failed:", err)
        return
    }
    console.log('File data:', jsonString)
    response.json(JSON.parse(jsonString));
    
})
  });

// Create New Note - takes in JSON input
app.post("/api/notes", function(req, res) {
    // req.body hosts is equal to the JSON post sent from the user
    
    var newNote = req.body;
  
    //newNote.routeName = newNote.title
  
    console.log(newNote);
  
    db.push(newNote);
  
    res.json(newNote);
  });


// Starts the server to begin listening
// =============================================================
app.listen(PORT, function() {
    console.log("App listening on PORT " + PORT);
  });
  console.log(db)
