APK बनाने के चरण (GitHub से):
1. github.com पर अकाउंट बनाएँ -> New repository (नाम: paas-ki-bus, Public या Private).
2. "uploading an existing file" पर क्लिक करें और इस ZIP के अंदर की सारी फ़ाइलें/फ़ोल्डर खींचकर डालें
   (.github फ़ोल्डर समेत) -> Commit changes.
   (अगर .github फ़ोल्डर न दिखे: Add file > Create new file में नाम
   .github/workflows/build.yml लिखकर build.yml की सामग्री paste करें.)
3. ऊपर Actions टैब खोलें -> "Build APK" -> Run workflow (हरा बटन).
4. 5-8 मिनट बाद रन पर क्लिक करें; नीचे Artifacts में paas-ki-bus-apk डाउनलोड करें.
5. ZIP खोलकर app-debug.apk फ़ोन में डालें और install करें (Unknown sources की अनुमति दें).
