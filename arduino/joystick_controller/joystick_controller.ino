// Joystick + keypad controller for the Time Machine game (Arduino Uno).
//
// Joystick:  GND -> GND, +5V -> 5V, VRx -> A0, VRy -> A1, SW -> D2.
// Keypad (4x4, 8 pins in a row): hold it with the keys facing you and the pins at the bottom, then count the pins from the left:
//            pins 1,2,3,4 (the rows)    -> D4, D5, D6, D7
//            pins 5,6,7,8 (the columns) -> D9, D10, D11, D12
// Optional buzzer: + side -> D8, other side -> GND (it beeps when you collect a coin or get hurt).
//
// It prints one line about 50 times a second:  x,y,button,key   (for example  -62,100,0,5)
//   x: -100 (left) .. 100 (right)   y: -100 (back) .. 100 (forward)   button: 1 while the stick is pressed down (a jump)
//   key: the keypad key being pressed (0-9, A-D, * or #), or nothing
// The game turns the stick into the keys A D W S and Space, and each keypad key into a game key (see KEYPAD in controller.js).
// Open the Serial Monitor at 115200 baud to check the numbers. If left/right or forward/back feel the wrong way round,
// change FLIP_X or FLIP_Y below.

const int PIN_X = A0, PIN_Y = A1, PIN_SW = 2, PIN_BUZZER = 8;
const bool FLIP_X = false, FLIP_Y = false;

const byte ROW_PINS[4] = {4, 5, 6, 7};
const byte COL_PINS[4] = {9, 10, 11, 12};
const char KEYS[4][4] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'},
};

int cx = 512, cy = 512;                      // where the stick rests (measured at start-up)
char rawKey = 0, stableKey = 0;              // a key counts once it has been read the same way twice in a row (no bounce)

void setup() {
  Serial.begin(115200);
  pinMode(PIN_SW, INPUT_PULLUP);             // pressed = LOW
  pinMode(PIN_BUZZER, OUTPUT);
  for (byte c = 0; c < 4; c++) pinMode(COL_PINS[c], INPUT_PULLUP);
  for (byte r = 0; r < 4; r++) pinMode(ROW_PINS[r], INPUT);
  delay(300);
  cx = analogRead(PIN_X);                    // do not touch the stick while it starts
  cy = analogRead(PIN_Y);
}

int axis(int raw, int center) {
  int v = raw - center;
  if (abs(v) < 40) return 0;                 // dead zone, so a resting stick does not drift
  int span = v < 0 ? center : 1023 - center;
  return constrain((long)v * 100 / span, -100, 100);
}

// Pull one row at a time low and see which column goes low with it.
char scanKeypad() {
  char found = 0;
  for (byte r = 0; r < 4 && !found; r++) {
    pinMode(ROW_PINS[r], OUTPUT);
    digitalWrite(ROW_PINS[r], LOW);
    delayMicroseconds(20);
    for (byte c = 0; c < 4; c++) if (digitalRead(COL_PINS[c]) == LOW) { found = KEYS[r][c]; break; }
    pinMode(ROW_PINS[r], INPUT);
  }
  return found;
}

void loop() {
  int x = axis(analogRead(PIN_X), cx);
  int y = -axis(analogRead(PIN_Y), cy);      // pushing the stick up gives a bigger y
  if (FLIP_X) x = -x;
  if (FLIP_Y) y = -y;

  char k = scanKeypad();
  if (k == rawKey) stableKey = k;
  rawKey = k;

  Serial.print(x); Serial.print(','); Serial.print(y); Serial.print(',');
  Serial.print(digitalRead(PIN_SW) == LOW ? 1 : 0); Serial.print(',');
  if (stableKey) Serial.print(stableKey);
  Serial.println();

  while (Serial.available()) {               // the game sends C for a coin and H for getting hurt
    char c = Serial.read();
    if (c == 'C') tone(PIN_BUZZER, 1800, 80);
    else if (c == 'H') tone(PIN_BUZZER, 220, 200);
  }
  delay(20);
}
