import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

// Initialize the client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      args: ['--no-sandbox']
    }
});

// Generate QR code for scanning
client.on('qr', (qr) => {
    console.log('סרוק את הברקוד הבא כדי לחבר את הסקריפט לוואטסאפ:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('הוואטסאפ מחובר בהצלחה!');
    
    // Test parameters
    const phoneNumber = process.argv[2] || "972500000000"; 
    const uniqueLink = "https://rsvp-app-sage.vercel.app?id=TEST1234";
    const name = "חגי";
    
    const message = `היי ${name} 👋\nרצינו להזמין אותך רשמית למסיבת ההפתעה שארגנו!\nכדי להקל עלינו את ההיערכות, נשמח אם תאשר הגעה בקישור האישי שלך:\n${uniqueLink}\n\nנתראה! 🥳`;

    // send message (using number format that whatsapp expects <number>@c.us)
    const chatId = `${phoneNumber}@c.us`;
    
    console.log(`שולח בדיקה למספר: ${phoneNumber}...`);
    
    client.sendMessage(chatId, message).then(response => {
        console.log("ההודעה המונית נשלחה במסגרת טסט בהצלחה!");
        setTimeout(() => {
            console.log("מתנתק מהוואטסאפ...");
            client.destroy();
            process.exit(0);
        }, 3000);
    }).catch(err => {
        console.error("שגיאה בשליחת הודעה:", err);
        process.exit(1);
    });
});

client.initialize();
