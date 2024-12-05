import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

     // DynamoDB Tables
     const imagesTable = new dynamodb.Table(this, "imagesTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "ImageName", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Images",
    });

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    const deadLetterQueue = new sqs.Queue(this, "deadLetter-queue", {
      queueName: "deadLetterQueue",
      retentionPeriod: cdk.Duration.minutes(30),
    });


    // Output
    
    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });
  


 // Integration infrastructure
 const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
  receiveMessageWaitTime: cdk.Duration.seconds(10),
});
const mailerQ = new sqs.Queue(this, "mailer-queue", {
  receiveMessageWaitTime: cdk.Duration.seconds(10),
});
const newImageTopic = new sns.Topic(this, "NewImageTopic", {
  displayName: "New Image topic",
}); 
    newImageTopic.addSubscription(
      new subs.SqsSubscription(imageProcessQueue)
    );
    newImageTopic.addSubscription(new subs.SqsSubscription(mailerQ));


// Lambda functions

const processImageFn = new lambdanode.NodejsFunction(
  this,
  "ProcessImageFn",
  {
    runtime: lambda.Runtime.NODEJS_18_X,
    entry: `${__dirname}/../lambdas/processImage.ts`,
    timeout: cdk.Duration.seconds(15),
    memorySize: 128,
    environment: {
      TABLE_NAME: "Images",
      REGION: 'eu-west-1',
    },
    deadLetterQueue: deadLetterQueue,
  }
);

const mailerFn = new lambdanode.NodejsFunction(this, "mailer-function", {
  runtime: lambda.Runtime.NODEJS_18_X,
  memorySize: 1024,
  timeout: cdk.Duration.seconds(3),
  entry: `${__dirname}/../lambdas/mailer.ts`,
});

const rejectionMailerFn = new lambdanode.NodejsFunction(this, "rejection-mailer-function", {
  runtime: lambda.Runtime.NODEJS_18_X,
  memorySize: 1024,
  timeout: cdk.Duration.seconds(3),
  entry: `${__dirname}/../lambdas/rejectionMailer.ts`,
});


// S3 --> SQS
imagesBucket.addEventNotification(
  s3.EventType.OBJECT_CREATED,
  new s3n.SnsDestination(newImageTopic)  // Changed
);

// SQS --> Lambda
const newImageEventSource = new events.SqsEventSource(imageProcessQueue, {
  batchSize: 5,
  maxBatchingWindow: cdk.Duration.seconds(5),
});
const newImageMailEventSource = new events.SqsEventSource(mailerQ, {
  batchSize: 5,
  maxBatchingWindow: cdk.Duration.seconds(5),
}); 

const rejectionMailEventSource = new events.SqsEventSource(mailerQ, {
  batchSize: 5,
  maxBatchingWindow: cdk.Duration.seconds(8),
});

processImageFn.addEventSource(newImageEventSource);
mailerFn.addEventSource(newImageMailEventSource);
rejectionMailerFn.addEventSource(rejectionMailEventSource);


// Permissions

imagesTable.grantReadWriteData(processImageFn);
imagesBucket.grantRead(processImageFn);
mailerFn.addToRolePolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      "ses:SendEmail",
      "ses:SendRawEmail",
      "ses:SendTemplatedEmail",
    ],
    resources: ["*"],
  })
);

rejectionMailerFn.addToRolePolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      "ses:SendEmail",
      "ses:SendRawEmail",
      "ses:SendTemplatedEmail",
    ],
    resources: ["*"],
  })
);


// Output

new cdk.CfnOutput(this, "bucketName", {
  value: imagesBucket.bucketName,
});
  }
}