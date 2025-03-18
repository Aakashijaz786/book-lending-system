const assert = require("assert")
const fs = require("fs-extra")
const path = require("path")
const bcrypt = require("bcryptjs")

// Constants
const DATA_FILE = path.join(__dirname, "./data/events.json")

// Test data
const testData = {
  users: [
    {
      id: "1",
      username: "testuser",
      password: bcrypt.hashSync("password123", 10),
      name: "Test User",
    },
  ],
  books: [
    {
      id: "1",
      title: "Test Book",
      author: "Test Author",
      category: "Test Category",
      available: true,
    },
  ],
  borrowedBooks: [],
}

// Helper function to reset test data
const resetTestData = async () => {
  await fs.writeJson(DATA_FILE, testData, { spaces: 2 })
}

// Test functions
const runTests = async () => {
  console.log("Starting tests...")

  try {
    // Setup test data
    await resetTestData()

    // Test data file exists
    await testDataFileExists()

    // Test data structure
    await testDataStructure()

    console.log("All tests passed!")
    process.exit(0)
  } catch (error) {
    console.error("Test failed:", error.message)
    process.exit(1)
  }
}

const testDataFileExists = async () => {
  const exists = await fs.pathExists(DATA_FILE)
  assert.strictEqual(exists, true, "Data file does not exist")
  console.log("✓ Data file exists")
}

const testDataStructure = async () => {
  const data = await fs.readJson(DATA_FILE)

  assert(Array.isArray(data.users), "Users should be an array")
  assert(Array.isArray(data.books), "Books should be an array")
  assert(Array.isArray(data.borrowedBooks), "BorrowedBooks should be an array")

  console.log("✓ Data structure is valid")
}

// Run tests
runTests()

