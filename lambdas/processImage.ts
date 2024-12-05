/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
const ddbDocClient = createDDbDocClient();


// const s3 = new S3Client();

export const handler: SQSHandler = async (event) => {
 
  for (const record of event.Records) {
  
    const recordBody = JSON.parse(record.body);
    const snsMessage = JSON.parse(recordBody.Message);



    if (snsMessage.Records) {
      for (const messageRecord of snsMessage.Records) {
        const s3e = messageRecord.s3;
        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));

        const eventType = messageRecord.eventName;

        // Handle object deletion
        if (eventType.includes("ObjectRemoved")) {
          await deleteImageFromDynamoDB(srcKey);
        } else if (eventType.includes("ObjectCreated")) {
          // Handle object creation
        const typeMatch = srcKey.match(/\.([^.]*)$/);
        if (!typeMatch) {
          console.log("Could not determine the image type.");
          throw new Error("Could not determine the image type. ");
        }
        const imageType = typeMatch[1].toLowerCase();
        if (imageType != "jpeg" && imageType != "png") {
          console.log(`Unsupported image type: ${imageType}`);
          throw new Error(`Unsupported image type: ${imageType}`);
        }
        const dynamodbUpload = await ddbDocClient.send(
          new PutCommand({
            TableName: "Images",
            Item: {
              "ImageName": srcKey
            },
          })
        );
        console.log("Response: ", dynamodbUpload)
      }
    }
  }
};



}
;



function createDDbDocClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  const marshallOptions = {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  };
  const unmarshallOptions = {
    wrapNumbers: false,
  };
  const translateConfig = { marshallOptions, unmarshallOptions };
  return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
const deleteImageFromDynamoDB = async (key: string) => {
  const params = {
    TableName: "Images",
    Key: {
      ImageName: key, //must match table 
    },
  };

  try {
    await ddbDocClient.send(new DeleteCommand(params));
  } catch (error) {
    throw error;
  }
};