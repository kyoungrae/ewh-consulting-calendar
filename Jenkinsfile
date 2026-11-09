// The fixed Jenkins job checks out origin/main, then loads this file.
properties([
  pipelineTriggers([]),
  disableConcurrentBuilds(),
  buildDiscarder(logRotator(numToKeepStr: '20'))
])
withEnv([
  "VERIFY_IMAGE=ewh-calendar/verify:${env.BUILD_TAG}",
  "APP_IMAGE=ewh-calendar/app:${env.BUILD_TAG}",
  "FIREBASE_IMAGE=ewh-calendar/firebase-deploy:${env.BUILD_TAG}"
]) {
  // The gateway credential is only required after the gateway is explicitly
  // enabled; existing direct-Funnel deployments continue without it.
  def gatewayLines = readFile('infra/jenkins/deploy.env').readLines().findAll { it.startsWith('GATEWAY_ENABLED=') }
  if (gatewayLines.size() > 1) error('GATEWAY_ENABLED must be specified at most once')
  def gatewayEnabled = gatewayLines ? gatewayLines[0].substring('GATEWAY_ENABLED='.length()).trim() : 'false'
  if (!['true', 'false'].contains(gatewayEnabled)) error('GATEWAY_ENABLED must be true or false')
  writeFile file: 'release-metadata.txt', text: "commit=${env.GIT_COMMIT}\ndeployment=api-and-hosting\napi_image=${env.APP_IMAGE}\nhosting_image=${env.FIREBASE_IMAGE}\n"
  try {
    stage('Verify') {
      sh 'sh ./scripts/jenkins-deploy.sh verify "$BUILD_TAG"'
    }
    stage('Build release') {
      sh 'sh ./scripts/jenkins-deploy.sh build "$BUILD_TAG"'
    }
    withCredentials([
      file(credentialsId: 'ewh-calendar-runtime-env', variable: 'RUNTIME_ENV_FILE'),
      file(credentialsId: 'ewh-calendar-firebase-admin', variable: 'FIREBASE_SERVICE_ACCOUNT_FILE'),
      file(credentialsId: 'firebase-consulting-deploy', variable: 'FIREBASE_TOKEN_FILE')
    ]) {
      stage('Check Hosting access') {
        sh 'sh ./scripts/jenkins-deploy.sh firebase-check "$BUILD_TAG"'
      }
      stage('Backup MongoDB') {
        sh 'sh ./scripts/jenkins-deploy.sh backup "$BUILD_TAG"'
      }
      stage('Deploy API') {
        if (gatewayEnabled == 'true') {
          withCredentials([string(credentialsId: 'ewh-calendar-gateway-hmac', variable: 'GATEWAY_HMAC_SECRET')]) {
            sh 'sh ./scripts/jenkins-deploy.sh deploy "$BUILD_TAG"'
          }
        } else {
          sh 'sh ./scripts/jenkins-deploy.sh deploy "$BUILD_TAG"'
        }
      }
      stage('Firebase Hosting') {
        sh 'sh ./scripts/jenkins-deploy.sh firebase "$BUILD_TAG"'
      }
      stage('Public smoke check') {
        sh 'sh ./scripts/jenkins-deploy.sh smoke "$BUILD_TAG"'
      }
    }
    echo "Calendar API and Hosting deployment succeeded: ${env.GIT_COMMIT}"
  } finally {
    try {
      archiveArtifacts artifacts: 'release-metadata.txt', fingerprint: true
    } finally {
      sh 'sh ./scripts/jenkins-deploy.sh cleanup "$BUILD_TAG"'
      deleteDir()
    }
  }
}
