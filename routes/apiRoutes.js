// ===============================================================================
// LOAD DATA
// We are linking our routes to a series of "data" sources.
// ===============================================================================

var notes = require("../db/db.json");
//Module that will generate the notes's ID 
const { v4: uuidv4 } = require("uuid");

// ===============================================================================
// ROUTING
// ===============================================================================

module.exports = function(app) {

  app.get("/api/notes", function(req, res) {
    res.json(notes);
  });

  // API POST Requests
  app.post("/api/notes", function(req, res) {
    
    var newNote = req.body;
    newNote.id = uuidv4();
    console.log(newNote);
    notes.push(newNote);
    res.json(newNote);
    
  })

  //Delete saved note
  app.delete("/api/notes/:id", function(req, res) {
    const deleteId = req.params.id;
    for (let i=0; i< notes.length; i++) {
      if (notes[i].id === deleteId) {
        // removes the i element from array
        notes.splice(i,1);
        break;
      }
    }

    //return the data as JSON in the response
    res.json(notes);
  });

};
