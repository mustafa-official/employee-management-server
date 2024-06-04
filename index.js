const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.elzgrcu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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
    const userCollection = client.db("assignmentTwelveDB").collection('users');
    const taskCollection = client.db("assignmentTwelveDB").collection('tasks');
    const paymentCollection = client.db("assignmentTwelveDB").collection('payments');
    const messageCollection = client.db("assignmentTwelveDB").collection('messages');


    // jwt related api 
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      })
      res.send({ token })
    })

    //middleware verify
    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorize access' })
      }
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorize access' })
        }
        req.decoded = decoded;
        next();
      })

    }

    //use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email
      const query = { email: email }
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        res.status(403).send({ message: 'forbidden access' })
      }
      next()
    }


    //payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })


    //get all messages by admin
    app.get('/messages', verifyToken, async (req, res) => {
      const result = await messageCollection.find().toArray();
      res.send(result);
    })

    // save message from contact page 
    app.post('/message', async (req, res) => {
      const contact = req.body;
      const result = await messageCollection.insertOne(contact);
      res.send(result);
    })

    //salary update hr, employee by admin
    app.patch('/update-salary/:id', async (req, res) => {
      const id = req.params.id;
      const newSalary = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          salary: newSalary.salary
        }
      }
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    //make employee to hr by admin
    app.patch('/make-hr/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const newHR = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: newHR.role,
          status: newHR.status
        }
      }
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    //employee fired by admin 
    app.patch('/employee-fired/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const newField = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          isFired: newField.isFired
        }
      }
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    // get all employee in admin page
    app.get('/admin/employees', verifyToken, verifyAdmin, async (req, res) => {
      const query = {
        $or: [
          { role: 'employee', status: true },
          { role: 'hr', status: false, }
        ]
      };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    })

    //get all payment history by email for pagination
    app.get('/payment-history/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const page = parseInt(req.query.page) - 1;
      const size = parseInt(req.query.size);
      // console.log(page, size);
      const result = await paymentCollection.find({ email }).skip(page * size).limit(size).toArray();
      res.send(result);
    })

    //get length payment history by email for pagination
    app.get('/payment-count/:email', async (req, res) => {
      const email = req.params.email;
      const count = await paymentCollection.countDocuments({ email: email });
      res.send({ count });
    })

    //get specific employee in payment collection
    app.get('/employee-stats/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email, payment: 'Successful' };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })

    //save to DB all payment history
    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    })

    //get all task
    app.get('/all-task', async (req, res) => {
      const name = req.query.name;
      const month = req.query.month;
      let query = {};
      if (name) {
        query.name = name
      }
      if (month) {
        query.date = { $regex: `^${month}/` }
      }
      const result = await taskCollection.find(query).toArray();
      res.send(result);
    })

    //get all task user name for dropdown
    app.get('/task/username', async (req, res) => {
      const result = await taskCollection.find().toArray();
      res.send(result);
    })

    // get task by (employee) user 
    app.get('/task/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await taskCollection.find(query).toArray();
      res.send(result)
    })

    //task
    app.post('/add-task', verifyToken, async (req, res) => {
      const task = req.body;
      const result = await taskCollection.insertOne(task);
      res.send(result);
    })

    //get a user by email
    app.get('/user/:email', async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email });
      res.send(result);
    })


    //employee status update
    app.patch('/update-status/:id', async (req, res) => {
      const id = req.params.id;
      const newStatus = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateStatus = {
        $set: {
          status: newStatus.status
        }
      }
      const result = await userCollection.updateOne(filter, updateStatus);
      res.send(result);
    })

    //get all employee info
    app.get('/all-employee', async (req, res) => {
      const query = { role: 'employee' }
      const result = await userCollection.find(query).toArray();
      res.send(result);
    })
    // users role save
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);


      // const existingFired = await userCollection.findOne({ isFired: true });
      // if (existingFired) {
      //   return res.status(403).send({ message: 'unauthorize access' })
      // }


      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: 'created' })
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Assignment 12 running')
})

app.listen(port, () => {
  console.log(`Assignment 12 running port is ${port}`);
})