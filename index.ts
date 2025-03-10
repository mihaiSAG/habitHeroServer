import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { connectDB } from "./db";
import { UserModel, Habit } from "./models";
import { IHabit } from "./data";
import mongoose from "mongoose";
import * as dotenv from 'dotenv';
import { apiKeyMiddleware } from "./middleware/apiKeyMiddleware";
import cors from 'cors';  // Import CORS middleware


// Load environment variables
dotenv.config();

const app = express();
const port = 3000;

// Use CORS middleware
app.use(cors());  // This will allow all origins by default

app.use(bodyParser.json());

// Apply the API key middleware to all routes
app.use(apiKeyMiddleware);

// Connect to MongoDB
connectDB();

app.get('/ip', (req, res) => {
    res.send({ ip: req.ip });
  });
  
// Get all users
app.get("/users", async (req: Request, res: Response) => {
    try {
        const users = await UserModel.find().exec();
        res.json(users);
    } catch (error) {
        res.status(500).send("Server error");
    }
});

// Get a specific user by ID
app.get("/users/:id", async (req: Request, res: Response) => {
    const userId = req.params.id;
    try {
        const user = await UserModel.findOne({ id: userId }).exec();
        if (user) {
            // Map through the user's habits to add the `has24HoursPassed` field
            const habitsWithStatus = user.habits.map((habit: Habit) => ({
                id: habit.id,
                name: habit.name,
                points: habit.points,
                lastUpdated: habit.lastUpdated,
                has24HoursPassed: habit.has24HoursPassed(), // Add the computed field
            }));

            // Return the user data along with the updated habits
            res.json({
                id: user.id,
                name: user.name,
                habits: habitsWithStatus,
            });
        } else {
            res.status(404).send("User not found");
        }
    } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).send("Server error");
    }
});


// Update a user's habit by habit ID
app.put("/users/:userId/habits/:habitId", async (req: Request, res: Response) => {
    const userId = req.params.userId;
    const habitId = req.params.habitId;
    const { name, points, lastUpdated } = req.body;

    try {
        const user = await UserModel.findOne({ id: userId }).exec();
        if (user) {
            // Find the habit by its ID
            const habit = user.habits.find((h: Habit) => h.id === habitId);
            if (habit) {
                if (name !== undefined) habit.name = name;
                if (points !== undefined) habit.points = points;
                if (lastUpdated !== undefined) habit.lastUpdated = new Date(lastUpdated);

                await user.save();
                res.json(habit);
            } else {
                res.status(404).send("Habit not found");
            }
        } else {
            res.status(404).send("User not found");
        }
    } catch (error) {
        res.status(500).send("Server error");
    }
});
// Default habits to be initialized for each new user
const defaultHabits: IHabit[] = [
    { id: new mongoose.Types.ObjectId().toString(), name: "Flotari", points: 0, lastUpdated:  new Date(2014, 4, 14) },
    { id: new mongoose.Types.ObjectId().toString(), name: "Oil Pulling", points: 0, lastUpdated:  new Date(2014, 4, 14) },
    { id: new mongoose.Types.ObjectId().toString(), name: "Meditare", points: 0, lastUpdated:  new Date(2014, 4, 14) },
    { id: new mongoose.Types.ObjectId().toString(), name: "Reading", points: 0, lastUpdated:  new Date(2014, 4, 14) },

];

// Register a new user
app.post("/register", async (req: Request, res: Response) => {
    const { name, pass } = req.body;

    if (!name || !pass) {
        return res.status(400).send("Name and password are required");
    }

    try {
        // Check if user already exists
        const existingUser = await UserModel.findOne({ name }).exec();
        if (existingUser) {
            return res.status(400).send("User already exists");
        }

        // Create a new user with default habits
        const newUser = new UserModel({
            id: new mongoose.Types.ObjectId().toString(),
            name,
            pass,
            habits: defaultHabits,
        });

        await newUser.save();
        res.status(201).json(newUser);
    } catch (error) {
        console.error("Error registering user:", error);
        res.status(500).send("Server error");
    }
});

// Login a user
app.post("/login", async (req: Request, res: Response) => {
    const { name, pass } = req.body;

    if (!name || !pass) {
        return res.status(400).send("Name and password are required");
    }

    try {
        // Find the user by name
        const user = await UserModel.findOne({ name }).exec();
        if (user) {
            // Compare the provided password with the stored password
            if (user.pass === pass) { // Consider hashing passwords for security
                res.json({
                    id: user.id,
                    name: user.name,
                    habits: user.habits, // You may want to include some data about habits or omit it for security
                });
            } else {
                res.status(401).send("Invalid password");
            }
        } else {
            res.status(404).send("User not found");
        }
    } catch (error) {
        console.error("Error logging in:", error);
        res.status(500).send("Server error");
    }
});


// Increment habit points by 1
app.patch("/users/:userId/habits/:habitId/increment", async (req: Request, res: Response) => {
    const userId = req.params.userId;
    const habitId = req.params.habitId;

    try {
        // Find the user by ID
        const user = await UserModel.findOne({ id: userId }).exec();
        if (user) {
            // Find the habit by ID
            const habit = user.habits.find((h: Habit) => h.id === habitId);
            if (habit) {
                const now = new Date();
                const lastUpdated = new Date(habit.lastUpdated);

                // Check if 24 hours have passed since the last update
                const hoursPassed = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);
                if (hoursPassed >= 24) {
                    // Increment the points
                    habit.points += 1;
                    habit.lastUpdated = now;

                    // Save the updated user
                    await user.save();
                    res.json(habit);
                } else {
                    res.status(400).send("Cannot increment. Less than 24 hours have passed since the last update.");
                }
            } else {
                res.status(404).send("Habit not found");
            }
        } else {
            res.status(404).send("User not found");
        }
    } catch (error) {
        console.error("Error incrementing habit points:", error);
        res.status(500).send("Server error");
    }
});

// Update habit name
app.patch("/users/:userId/habits/:habitId/name", async (req: Request, res: Response) => {
    const userId = req.params.userId;
    const habitId = req.params.habitId;
    const { name } = req.body;

    if (!name) {
        return res.status(400).send("New habit name is required");
    }

    try {
        // Find the user by ID
        const user = await UserModel.findOne({ id: userId }).exec();
        if (user) {
            // Find the habit by ID
            const habit = user.habits.find((h: Habit) => h.id === habitId);
            if (habit) {
                // Update the habit name
                habit.name = name;
                habit.lastUpdated = new Date();

                // Save the updated user
                await user.save();
                res.json(habit);
            } else {
                res.status(404).send("Habit not found");
            }
        } else {
            res.status(404).send("User not found");
        }
    } catch (error) {
        console.error("Error updating habit name:", error);
        res.status(500).send("Server error");
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
