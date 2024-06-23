module.exports = function(RED) {
    function OpcuaOtmrNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.endpoint = config.endpoint;
        node.port = parseInt(config.port); // Parse port as an integer
        node.nodeIds = config.nodeIds ? config.nodeIds.split(",").map(id => id.trim()) : []; // Split Node IDs by comma and trim whitespace, default to empty array
        node.dataType = config.dataType;

        const opcua = require("node-opcua");
        let client = opcua.OPCUAClient.create();
        let session = null;

        async function connectToServer() {
            try {
                const endpointUrl = `${node.endpoint}:${node.port}`;
                await client.connect(endpointUrl);
                node.log("Connected to OPC UA server");
                session = await client.createSession();
                node.log("Session created");
            } catch (err) {
                node.error("Failed to connect to OPC UA server: " + err.message);
                node.status({ fill: "red", shape: "ring", text: "connection failed" });
            }
        }

        async function disconnectFromServer() {
            if (session) {
                try {
                    await session.close();
                    node.log("Session closed");
                } catch (closeError) {
                    node.error("Failed to close session: " + closeError.message);
                }
                session = null;
            }
            await client.disconnect();
            node.log("Disconnected from OPC UA server");
        }

        node.on('input', async function(msg) {
            const nodeIds = node.nodeIds || msg.nodeIds || [];
            const dataType = node.dataType || msg.dataType;

            if (!node.endpoint || isNaN(node.port) || node.port < 0 || node.port > 65535 || nodeIds.length === 0) {
                node.error("Endpoint URL, port, and Node IDs must be provided.");
                node.status({ fill: "red", shape: "ring", text: "missing required fields" });
                return;
            }

            if (!client || !session) {
                await connectToServer();
            }

            try {
                const dataValues = await Promise.all(nodeIds.map(async (nodeId) => {
                    const dataValue = await session.readVariableValue(nodeId);
                    return { nodeId, value: dataValue.value.value };
                }));
                node.log(`Read values from Node IDs: ${JSON.stringify(dataValues)}`);
                msg.payload = dataValues;
                node.send(msg);
                node.status({ fill: "green", shape: "dot", text: "data read successfully" });
            } catch (err) {
                node.error("Failed to read values from OPC UA server: " + err.message);
                node.status({ fill: "red", shape: "ring", text: "read error" });
            }
        });

        node.on('close', async function() {
            await disconnectFromServer();
        });

        process.on('SIGINT', async function() {
            await disconnectFromServer();
            process.exit();
        });
    }

    RED.nodes.registerType("opcua-otmr", OpcuaOtmrNode);
};
