const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);


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
    const sportCollection = db.collection("sports");
    const courtsCollection = db.collection("courts");
    const bookingsCollection = db.collection("bookings");
    const usersCollection = db.collection("users");

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

//  Get all pending bookings for the logged-in user
app.get('/bookings/pending/:email', verifyFbToken, async (req, res) => {
  const email = req.params.email;
  const bookings = await bookingsCollection.find({ userEmail: email, status: "pending" }).toArray();
  res.send(bookings);
});

//  Delete a booking by ID
app.delete('/bookings/:id', verifyFbToken, async (req, res) => {
  const id = req.params.id;
  const result = await bookingsCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});


 // Route to create booking 
    app.post('/bookings', verifyFbToken, async (req, res) => {
      const booking = req.body;
      booking.status = "pending"; // default status
      const result = await bookingsCollection.insertOne(booking);
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