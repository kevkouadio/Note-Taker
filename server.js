// ==============================================================================
// DEPENDENCIES
// ==============================================================================
var express = require("express");
var safeDb = require("./safe-db");

// ==============================================================================
// EXPRESS CONFIGURATION
// ==============================================================================
var app = express();
var PORT = process.env.PORT || 8080;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

// ================================================================================
// ROUTER
// ================================================================================
require("./routes/apiRoutes")(app);
require("./routes/htmlRoutes")(app);

// =============================================================================
// LISTENER (initialize DB safely before starting)
// =============================================================================
(async () => {
  try {
    await safeDb.ensureDb();
    app.listen(PORT, function() {
      console.log("App listening on PORT: " + PORT);
    });
  } catch (err) {
    console.error("Failed to initialize DB, exiting:", err);
    process.exit(1);
  }
})();
