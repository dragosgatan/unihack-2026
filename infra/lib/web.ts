import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  PriceClass,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, CacheControl, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface WebProps {
  distDir: string;
  apiDomainName: string;
}

const spaRewrite = `function handler(event) {
  var request = event.request;
  var last = request.uri.split('/').pop();
  if (last.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}`;

export class Web extends Construct {
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: WebProps) {
    super(scope, id);

    const bucket = new Bucket(this, 'Bucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const spaRouting = new CloudFrontFunction(this, 'SpaRouting', {
      code: FunctionCode.fromInline(spaRewrite),
      runtime: FunctionRuntime.JS_2_0,
    });

    this.distribution = new Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{ function: spaRouting, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new HttpOrigin(props.apiDomainName, { protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY }),
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    const source = Source.asset(props.distDir);

    const hashedAssets = new BucketDeployment(this, 'HashedAssets', {
      sources: [source],
      destinationBucket: bucket,
      exclude: ['*'],
      include: ['assets/*'],
      prune: false,
      cacheControl: [CacheControl.setPublic(), CacheControl.maxAge(Duration.days(365)), CacheControl.immutable()],
    });

    const entryFiles = new BucketDeployment(this, 'EntryFiles', {
      sources: [source],
      destinationBucket: bucket,
      exclude: ['assets/*'],
      cacheControl: [CacheControl.noCache()],
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });
    entryFiles.node.addDependency(hashedAssets);
  }
}
