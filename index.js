const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);
const courts = require('../scms-client-side/public/courts.json');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iuxl4dg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db("sportDB");
    const courtsCollection = db.collection("courts");
    const bookingsCollection = db.collection("bookings");
    const usersCollection = db.collection("users");
    const announcementsCollection = db.collection("announcements");



    // custom middleware
  const verifyFbToken = async(req,res,next)=>{
    const authHeaders = req.headers.authorization;
    if(!authHeaders){
      return res.status(401).send({message: "unauthorized access"})
    }

    const token = authHeaders.split(' ')[1];
    if(!token){
      return res.status(401).send({message: "unauthorized access"})
    }
      try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.decoded = decodedToken;
    next();
  } catch (error) {
    res.status(403).send({ message: "Forbidden access" });
  }
  }

  // varify admin role
  const verifyAdmin = async (req, res, next) => {
  const email = req.decoded.email;
  if (!email) return res.status(401).send({ message: "Unauthorized" });

  try {
    const user = await usersCollection.findOne({ email });
    if(!user || user.role !== 'admin'){
      return res.status(403).send({message: "Forbidden accesss"})
    }
    next();
  } catch (error) {
    console.error("Error fetching user role:", error);
    res.status(500).send({ message: "Failed to fetch user role" });
  }
};

// Verify Member Middleware
const verifyMember = async (req, res, next) => {
  const email = req.decoded.email;
  if (!email) return res.status(401).send({ message: "Unauthorized" });

  try {
    const user = await usersCollection.findOne({ email });
    if(!user || user.role !== 'member'){
      return res.status(403).send({message: "Forbidden accesss"})
    }
    next();
  } catch (error) {
    console.error("Error fetching user role:", error);
    res.status(500).send({ message: "Failed to fetch user role" });
  }
};

// Get all users or search by name/email
app.get('/users', verifyFbToken, verifyAdmin, async (req, res) => {
  const search = req.query.search;
  let query = {};

  if (search) {
    query = {
      $or: [
        { displayName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ]
    };
  }

  try {
    const users = await usersCollection.find(query).toArray();
    res.send(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send({ message: "Failed to fetch users" });
  }
});

// GET user role by email 
app.get('/users/role/:email', async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) {
      return res.status(400).send({ message: "Email parameter is required" });
    }
    const user = await usersCollection.findOne(
      { email }
    );
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    res.send({ role: user.role || "user" }); 
  } catch (error) {
    console.error("Error fetching user role:", error);
    res.status(500).send({ message: "Failed to get user role" });
  }
});

 // GET user by email (protected)
app.get('/users/:email', verifyFbToken, async (req, res) => {
  const email = req.params.email;
  const user = await usersCollection.findOne({ email });
  res.send(user);
});

    // Save new user to DB if not exists
app.post("/users", async (req, res) => {
  try {
    const user = req.body;
    const existingUser = await usersCollection.findOne({ email: user.email });

    if (existingUser) {
      return res.send({ message: "User already exists", inserted: false });
    }

    const result = await usersCollection.insertOne(user);
    res.status(201).send({ message: "User created", inserted: true, result });
  } catch (error) {
    console.error("Error saving user:", error);
    res.status(500).send({ message: "Failed to save user" });
  }
});


//  Route to get courts with pagination
    app.get('/courts', async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 6;
      const skip = (page - 1) * limit;

      const total = await courtsCollection.countDocuments();
      const courts = await courtsCollection.find().skip(skip).limit(limit).toArray();

      res.send({ courts, total });
    });

    // Get all courts (no pagination) for admin manage page
app.get('/courts/all', verifyFbToken, verifyAdmin, async (req, res) => {
  try {
    const courts = await courtsCollection.find().toArray();
    res.send(courts);
  } catch (error) {
    console.error("Error fetching all courts:", error);
    res.status(500).send({ message: "Failed to fetch all courts" });
  }
});

// Add new court
app.post('/courts', verifyFbToken, verifyAdmin, async (req, res) => {
  try {
    const court = req.body;
    const result = await courtsCollection.insertOne(court);
    res.send(result);
  } catch (error) {
    console.error("Error adding court:", error);
    res.status(500).send({ message: "Failed to add court" });
  }
});

// Update court by ID
app.put('/courts/:id', verifyFbToken, verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const updatedCourt = req.body;

  // Remove _id field if it exists in payload
  delete updatedCourt._id;

  try {
    const result = await courtsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedCourt }
    );
    res.send(result);
  } catch (error) {
    console.error("Error updating court:", error);
    res.status(500).send({ message: "Update failed" });
  }
});

// Delete court
app.delete('/courts/:id', verifyFbToken, verifyAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await courtsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Court not found" });
    }
    res.send({ message: "Court deleted", result });
  } catch (error) {
    console.error("Error deleting court:", error);
    res.status(500).send({ message: "Delete failed" });
  }
});

  //  Route to bulk insert courts data 
    app.post('/courts/bulk', async (req, res) => {
  const courts = req.body;
  if (!Array.isArray(courts)) {
    return res.status(400).send({ message: "Invalid data format" });
  }
  try {
    const result = await courtsCollection.insertMany(courts);
    res.send({ message: "Courts inserted", count: result.insertedCount });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Insert failed" });
  }
});

// Get all pending bookings
app.get('/bookings/pending', verifyFbToken, verifyAdmin, async (req, res) => {
  const pendingBookings = await bookingsCollection.find({ status: "pending" }).toArray();
  res.send(pendingBookings);
});


//  Get all pending bookings for the logged-in user
app.get('/bookings/pending/:email', verifyFbToken, async (req, res) => {
  const email = req.params.email;
  const bookings = await bookingsCollection.find({ userEmail: email, status: "pending" }).toArray();
  res.send(bookings);
});

//get all approved bookings
app.get('/bookings/approved/:email', verifyFbToken, verifyMember, async (req, res) => {
  const email = req.params.email;
  const bookings = await bookingsCollection.find({ userEmail: email, status: "approved" }).toArray();
  res.send(bookings);
});

//  Cancel booking by updating status
app.patch('/bookings/cancel/:id', verifyFbToken, async (req, res) => {
  const id = req.params.id;
  const result = await bookingsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "cancelled" } }
  );
  res.send(result);
});

// Approve booking 
app.patch('/bookings/approve/:id', verifyFbToken, verifyAdmin, async (req, res) => {
  const bookingId = req.params.id;

  // Find the booking first
 const booking = await bookingsCollection.findOne({ _id: new ObjectId(bookingId) });
  if (!booking) {
    return res.status(404).send({ message: "Booking not found" });
  }

  const userEmail = booking.userEmail;

  // Update booking status to 'approved'
  const updateBookingResult = await bookingsCollection.updateOne(
    { _id: new ObjectId(bookingId) },
    { $set: { status: "approved" } }
  );

  // Update user role to 'member' and set membership date
  const updateUserResult = await usersCollection.updateOne(
    { email: userEmail },
    { $set: { role: "member", membership_date: new Date() } }
  );

  res.send({
    message: "Booking approved and user promoted to member",
    bookingUpdated: updateBookingResult.modifiedCount > 0,
    userUpdated: updateUserResult.modifiedCount > 0
  });
});

// Reject (Delete) booking
app.delete('/bookings/reject/:id', verifyFbToken, verifyAdmin, async (req, res) => {
  const bookingId = req.params.id;
  const result = await bookingsCollection.deleteOne({ _id: new ObjectId(bookingId) });
  res.send(result);
});

 // Route to create booking 
    app.post('/bookings', verifyFbToken, async (req, res) => {
      const booking = req.body;
      booking.status = "pending"; 
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

// Admin stats route
app.get('/admin/stats', verifyFbToken, verifyAdmin, async (req, res) => {
  try {
    const totalCourts = await courtsCollection.countDocuments();
    const totalUsers = await usersCollection.countDocuments();
    const totalMembers = await usersCollection.countDocuments({ role: "member" });

    res.send({ totalCourts, totalUsers, totalMembers });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).send({ message: "Failed to fetch stats" });
  }
});

// Get all members or search by name
app.get('/members', verifyFbToken, verifyAdmin, async (req, res) => {
  const search = req.query.search;
  let query = { role: "member" };

  if (search) {
    query.displayName = { $regex: search, $options: "i" }; // case-insensitive search by name
  }

  try {
    const members = await usersCollection.find(query).toArray();
    res.send(members);
  } catch (error) {
    console.error("Error fetching members:", error);
    res.status(500).send({ message: "Failed to fetch members" });
  }
});

// Delete a member by id
app.delete('/members/:id', verifyFbToken, verifyAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    console.error("Error deleting member:", error);
    res.status(500).send({ message: "Failed to delete member" });
  }
});


// Get all announcements
app.get('/announcements', async (req, res) => {
  const announcements = await announcementsCollection.find().toArray();
  res.send(announcements);
});

// Add announcement
app.post('/announcements', async (req, res) => {
  const announcement = req.body;
  const result = await announcementsCollection.insertOne(announcement);
  res.send(result);
});

// Update announcement
app.put('/announcements/:id', async (req, res) => {
  const id = req.params.id;
  const data = req.body;

  const result = await announcementsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: data }
  );
  res.send(result);
});

// Delete announcement
app.delete('/announcements/:id', async (req, res) => {
  const id = req.params.id;
  const result = await announcementsCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

  } finally {
    
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Welcome to Sports Club Server');
});
 app.listen(PORT, () => {
 
 });