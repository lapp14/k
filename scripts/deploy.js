
const { CONFIG } = require('./config.js');
const { assets, cloudfrontDistributionId, deploymentTitle, s3Bucket } = require('../package.json');

const path = require('path');
const AWS = require('aws-sdk');
const fs = require('fs');
const mime = require('mime-types')

process.env.AWS_ACCESS_KEY_ID = CONFIG.awsAccessKey;
process.env.AWS_SECRET_ACCESS_KEY = CONFIG.awsSecretKey;

const BASEPATH = path.join(__dirname, '../');

const getAssets = async () => {
    const assetsList = [];
    await Promise.all(assets.map(async (filepath) => {
        if (fs.lstatSync(filepath).isDirectory()) {
            const paths = fs.readdirSync(filepath);
            paths.forEach(file => {
                const contentType = mime.lookup(path.join(BASEPATH, filepath, file))
                if (contentType) {
                    assetsList.push({
                        source: path.join(BASEPATH, filepath, file),
                        destination: pathReplace(path.join(filepath, file)),
                        contentType
                    });
                }                
            });
        } else { 
            const contentType = mime.lookup(path.join(BASEPATH, filepath))
            if (contentType) {
                assetsList.push({
                    source: path.join(BASEPATH, filepath),
                    destination: pathReplace(filepath),
                    contentType
                });
            }
                
        }
    }));
    return assetsList;
};

// windows path fix, replaces backslashes with forward slashes
const pathReplace = path => {
    return path.replace(/\\/g, '/');
}

const uploadFile = async (source, destination, contentType) => {
    if (!contentType) {
        return;
    }

    console.log(`  - Uploading ${source} to ./${destination} (${contentType})`);

    return new AWS.S3().upload({
        ACL: 'public-read',
        Body: fs.createReadStream(source),
        Bucket: s3Bucket,
        ContentType: contentType,
        Key: destination
    }).promise();
};

const uploadAll = async () => {  
    const assets = await getAssets();
    await Promise.all(assets.map(asset => uploadFile(asset.source, asset.destination, asset.contentType)))
};

const cloudfrontCacheInvalidation = async () => {
    return new AWS.CloudFront().createInvalidation({
        DistributionId: cloudfrontDistributionId,
        InvalidationBatch: {
            CallerReference: `${deploymentTitle}.${new Date().getTime().toString()}`,
            Paths: {
                Quantity: 1,
                Items: ['/*']
            }
        }
    }).promise();
};

const deploy = async () => {
    console.log(`Deplying to S3 bucket: ${s3Bucket}`);
    console.log('....................')
    console.log('Uploading assets...') ;
    console.log(`- Project basepath: ${BASEPATH}`);
    await uploadAll();
    console.log('Creating invalidation...');
    console.log(`- Cloudfront distribution: ${cloudfrontDistributionId}`);    
    const invalidation = await cloudfrontCacheInvalidation();        
    console.log(`- Invalidation ID: ${invalidation.Invalidation.Id}`);
};

deploy();
