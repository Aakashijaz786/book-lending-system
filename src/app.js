const express = require("express")
const fs = require("fs-extra")
const path = require("path")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const bodyParser = require("body-parser")
const moment = require("moment")

// Initialize express app
const app = express()
app.use(bodyParser.json())

// Constants
const PORT = process.env.PORT || 3001
const DATA_FILE = path.join(__dirname, "../data/events.json")
const JWT_SECRET = "book-lending-system-secret"

// Helper functions
const readData = async () => {
  try {
    const data = await fs.readJson(DATA_FILE)
    return data
  } catch (error) {
    console.error("Error reading data file:", error)
    return { users: [], books: [], borrowedBooks: [] }
  }
}

const writeData = async (data) => {
  try {
    await fs.writeJson(DATA_FILE, data, { spaces: 2 })
    return true
  } catch (error) {
    console.error("Error writing to data file:", error)
    return false
  }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) return res.status(401).json({ message: "Authentication token required" })

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid or expired token" })
    req.user = user
    next()
  })
}

// User routes
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, name } = req.body

    if (!username || !password || !name) {
      return res.status(400).json({ message: "All fields are required" })
    }

    const data = await readData()

    // Check if username already exists
    if (data.users.some((user) => user.username === username)) {
      return res.status(400).json({ message: "Username already exists" })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create new user
    const newUser = {
      id: Date.now().toString(),
      username,
      password: hashedPassword,
      name,
    }

    data.users.push(newUser)
    await writeData(data)

    res.status(201).json({ message: "User registered successfully" })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" })
    }

    const data = await readData()
    const user = data.users.find((u) => u.username === username)

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Generate JWT token
    const token = jwt.sign({ id: user.id, username: user.username, name: user.name }, JWT_SECRET, { expiresIn: "24h" })

    res.json({ token, user: { id: user.id, username: user.username, name: user.name } })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Book routes
app.get("/api/books", async (req, res) => {
  try {
    const data = await readData()
    res.json(data.books)
  } catch (error) {
    console.error("Error fetching books:", error)
    res.status(500).json({ message: "Server error" })
  }
})

app.post("/api/books", authenticateToken, async (req, res) => {
  try {
    const { title, author, category } = req.body

    if (!title || !author || !category) {
      return res.status(400).json({ message: "Title, author, and category are required" })
    }

    const data = await readData()

    const newBook = {
      id: Date.now().toString(),
      title,
      author,
      category,
      available: true,
    }

    data.books.push(newBook)
    await writeData(data)

    res.status(201).json(newBook)
  } catch (error) {
    console.error("Error adding book:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Book lending routes
app.post("/api/borrow", authenticateToken, async (req, res) => {
  try {
    const { bookId, borrowerName, dueDate } = req.body

    if (!bookId || !borrowerName || !dueDate) {
      return res.status(400).json({ message: "Book ID, borrower name, and due date are required" })
    }

    const data = await readData()

    // Find the book
    const bookIndex = data.books.findIndex((book) => book.id === bookId)

    if (bookIndex === -1) {
      return res.status(404).json({ message: "Book not found" })
    }

    // Check if book is available
    if (!data.books[bookIndex].available) {
      return res.status(400).json({ message: "Book is already borrowed" })
    }

    // Update book availability
    data.books[bookIndex].available = false

    // Create borrowed book record
    const borrowedBook = {
      id: Date.now().toString(),
      bookId,
      bookTitle: data.books[bookIndex].title,
      bookAuthor: data.books[bookIndex].author,
      category: data.books[bookIndex].category,
      borrowerName,
      borrowedBy: req.user.id,
      borrowedDate: new Date().toISOString(),
      dueDate,
      returned: false,
    }

    data.borrowedBooks.push(borrowedBook)
    await writeData(data)

    res.status(201).json(borrowedBook)
  } catch (error) {
    console.error("Error borrowing book:", error)
    res.status(500).json({ message: "Server error" })
  }
})

app.post("/api/return", authenticateToken, async (req, res) => {
  try {
    const { borrowId } = req.body

    if (!borrowId) {
      return res.status(400).json({ message: "Borrow ID is required" })
    }

    const data = await readData()

    // Find the borrowed book record
    const borrowIndex = data.borrowedBooks.findIndex((borrow) => borrow.id === borrowId)

    if (borrowIndex === -1) {
      return res.status(404).json({ message: "Borrowed book record not found" })
    }

    // Check if book is already returned
    if (data.borrowedBooks[borrowIndex].returned) {
      return res.status(400).json({ message: "Book is already returned" })
    }

    // Update borrowed book record
    data.borrowedBooks[borrowIndex].returned = true
    data.borrowedBooks[borrowIndex].returnDate = new Date().toISOString()

    // Update book availability
    const bookIndex = data.books.findIndex((book) => book.id === data.borrowedBooks[borrowIndex].bookId)

    if (bookIndex !== -1) {
      data.books[bookIndex].available = true
    }

    await writeData(data)

    res.json(data.borrowedBooks[borrowIndex])
  } catch (error) {
    console.error("Error returning book:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Get borrowed books with filtering
app.get("/api/borrowed", authenticateToken, async (req, res) => {
  try {
    const { category, borrowerName, dueDate, overdue } = req.query
    const userId = req.user.id

    const data = await readData()

    // Filter borrowed books by user
    let borrowedBooks = data.borrowedBooks.filter((book) => book.borrowedBy === userId)

    // Apply filters
    if (category) {
      borrowedBooks = borrowedBooks.filter((book) => book.category === category)
    }

    if (borrowerName) {
      borrowedBooks = borrowedBooks.filter((book) =>
        book.borrowerName.toLowerCase().includes(borrowerName.toLowerCase()),
      )
    }

    if (dueDate) {
      const targetDate = moment(dueDate).startOf("day")
      borrowedBooks = borrowedBooks.filter((book) => moment(book.dueDate).startOf("day").isSame(targetDate))
    }

    if (overdue === "true") {
      const today = moment().startOf("day")
      borrowedBooks = borrowedBooks.filter((book) => !book.returned && moment(book.dueDate).isBefore(today))
    }

    res.json(borrowedBooks)
  } catch (error) {
    console.error("Error fetching borrowed books:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Get book categories
app.get("/api/categories", async (req, res) => {
  try {
    const data = await readData()
    const categories = [...new Set(data.books.map((book) => book.category))]
    res.json(categories)
  } catch (error) {
    console.error("Error fetching categories:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Start the server
// Only start the server if this file is run directly, not when imported for testing
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Book Lending System server running on port ${PORT}`)
  })
}

// Export for testing
module.exports = app

