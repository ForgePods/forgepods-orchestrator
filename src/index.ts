import { connectDatabase } from "./database/connectDB.js";
import { connectRabbitMQ } from "./rabbitmq/connectRabbitMQ.js";
import { setupRabbitMQTopology } from "./rabbitmq/topology.js";

await connectDatabase();
const rabbitMQConnection = await connectRabbitMQ();
await setupRabbitMQTopology(rabbitMQConnection);
