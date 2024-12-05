import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { SNSEvent, SNSHandler } from "aws-lambda";
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || "eu-west-1" });
const TABLE_NAME = "Images"; // DynamoDB table name

const validMetadataTypes = ["Caption", "Date", "Photographer"];// List of valid metadata types

export const handler: SNSHandler = async (event: SNSEvent) => {
  for (const record of event.Records) {
    const snsMessage = JSON.parse(record.Sns.Message);
   
    const metadataType = record.Sns.MessageAttributes?.metadata_type?.Value;    // Extract metadata type

  
    if (!metadataType || !validMetadataTypes.includes(metadataType)) {    // Skip invalid metadata types

      continue;    // Check if both id and value exist

    }
    const { id, value } = snsMessage;


    if (id && value) {
      await updateTable(id, metadataType, value);
    }
  }
};
// Function to update DynamoDB item

const updateTable = async (id: string, metadataType: string, value: string) => {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      ImageName: { S: id },
    },
    UpdateExpression: `SET #attr = :value`,
    ExpressionAttributeNames: {
      "#attr": metadataType,
    },
    ExpressionAttributeValues: {
      ":value": { S: value },
    },
  };
  await dynamoClient.send(new UpdateItemCommand(params));// Send update request
};