// The fixed Jenkins job checks out origin/main, then loads this file.
properties([
  pipelineTriggers([]),
  disableConcurrentBuilds(),
  buildDiscarder(logRotator(numToKeepStr: '20'))
])
withEnv([
  "FIREBASE_IMAGE=ewh-calendar/firebase-deploy:${env.BUILD_TAG}"
]) {
  writeFile file: 'release-metadata.txt', text: "commit=${env.GIT_COMMIT}\ndeployment=hosting-only\nhosting_image=${env.FIREBASE_IMAGE}\n"
  try {
    stage('Build release') {
      sh 'sh ./scripts/jenkins-deploy.sh build-hosting "$BUILD_TAG"'
    }
    withCredentials([
      file(credentialsId: 'firebase-consulting-deploy', variable: 'FIREBASE_TOKEN_FILE')
    ]) {
      stage('Firebase Hosting') {
        sh 'sh ./scripts/jenkins-deploy.sh firebase "$BUILD_TAG"'
      }
      stage('Public smoke check') {
        sh 'sh ./scripts/jenkins-deploy.sh smoke-hosting "$BUILD_TAG"'
      }
    }
    echo "Calendar Hosting deployment succeeded: ${env.GIT_COMMIT} (API unchanged)"
  } finally {
    try {
      archiveArtifacts artifacts: 'release-metadata.txt', fingerprint: true
    } finally {
      sh 'sh ./scripts/jenkins-deploy.sh cleanup "$BUILD_TAG"'
      deleteDir()
    }
  }
}
