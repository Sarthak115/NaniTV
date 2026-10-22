import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
// Debug loads the laptop's Vite dev server over LAN; release loads the hosted app.
val devUrl: String = localProps.getProperty("nanitv.devUrl", "http://192.168.1.10:5173/tv")
val releaseUrl: String = localProps.getProperty("nanitv.releaseUrl", "https://nanitv.vercel.app/tv")

android {
    namespace = "com.nanitv.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.nanitv.app"
        minSdk = 22
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        debug {
            buildConfigField("String", "WEB_URL", "\"$devUrl\"")
            manifestPlaceholders["usesCleartext"] = "true"
        }
        release {
            isMinifyEnabled = false
            buildConfigField("String", "WEB_URL", "\"$releaseUrl\"")
            manifestPlaceholders["usesCleartext"] = "false"
            // Hackathon: debug-signed release so it can be sideloaded with adb.
            signingConfig = signingConfigs.getByName("debug")
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
