import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

val friemiBaseUrl = providers
    .gradleProperty("friemiBaseUrl")
    .orElse("https://www.friemi.com")
    .get()
    .trimEnd('/')
val friemiVersionCode = providers
    .gradleProperty("friemiVersionCode")
    .map { it.toInt() }
    .orElse(6)
    .get()
val friemiVersionName = providers
    .gradleProperty("friemiVersionName")
    .orElse("0.1.0-internal2")
    .get()
val friemiAppLinkHost = providers
    .gradleProperty("friemiAppLinkHost")
    .orElse(
        runCatching { URI(friemiBaseUrl).host }
            .getOrNull()
            ?.takeIf { it.isNotBlank() }
            ?: "www.friemi.com",
    )
    .get()

fun releaseStringProperty(gradleName: String, envName: String): String? =
    providers
        .gradleProperty(gradleName)
        .orElse(providers.environmentVariable(envName))
        .orNull
        ?.trim()
        ?.takeIf { it.isNotEmpty() }

val friemiReleaseStoreFile = releaseStringProperty(
    "friemiReleaseStoreFile",
    "FRIEMI_RELEASE_STORE_FILE",
)
val friemiReleaseStorePassword = releaseStringProperty(
    "friemiReleaseStorePassword",
    "FRIEMI_RELEASE_STORE_PASSWORD",
)
val friemiReleaseKeyAlias = releaseStringProperty(
    "friemiReleaseKeyAlias",
    "FRIEMI_RELEASE_KEY_ALIAS",
)
val friemiReleaseKeyPassword = releaseStringProperty(
    "friemiReleaseKeyPassword",
    "FRIEMI_RELEASE_KEY_PASSWORD",
) ?: friemiReleaseStorePassword
val hasFriemiReleaseSigning = listOf(
    friemiReleaseStoreFile,
    friemiReleaseStorePassword,
    friemiReleaseKeyAlias,
    friemiReleaseKeyPassword,
).all { !it.isNullOrBlank() }

android {
    namespace = "com.friemi.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.friemi.app"
        minSdk = 26
        targetSdk = 36
        versionCode = friemiVersionCode
        versionName = friemiVersionName

        buildConfigField("String", "FRIEMI_BASE_URL", "\"$friemiBaseUrl\"")
        buildConfigField("String", "FRIEMI_DEFAULT_PATH", "\"/mobile-home\"")
        manifestPlaceholders["friemiAppLinkHost"] = friemiAppLinkHost
        manifestPlaceholders["friemiUsesCleartextTraffic"] = "false"
    }

    signingConfigs {
        if (hasFriemiReleaseSigning) {
            create("release") {
                storeFile = file(friemiReleaseStoreFile!!)
                storePassword = friemiReleaseStorePassword
                keyAlias = friemiReleaseKeyAlias
                keyPassword = friemiReleaseKeyPassword
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            manifestPlaceholders["friemiUsesCleartextTraffic"] = "true"
        }

        release {
            isMinifyEnabled = true
            isShrinkResources = true
            manifestPlaceholders["friemiUsesCleartextTraffic"] = "false"
            if (hasFriemiReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.core:core:1.17.0")
    implementation("androidx.fragment:fragment:1.9.0")
    implementation(platform("com.google.firebase:firebase-bom:34.18.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
}
