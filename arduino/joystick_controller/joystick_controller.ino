// Joystick controller for the Time Machine game (Arduino Uno).
//
// Wiring:  joystick GND -> GND, +5V -> 5V, VRx -> A0, VRy -> A1, SW -> D2.
//          Optional buzzer: + side -> D8, other side -> GND (it beeps when you collect a coin or get hurt).
//
// It prints one line about 50 times a second:  x,y,button   (for example  -62,100,0)
//   x: -100 (left) .. 100 (right)     y: -100 (back) .. 100 (forward)     button: 1 while the stick is pressed down
// The game turns that into the keys A D W S and Space. Open the Serial Monitor at 115200 baud to check the numbers.
// If left/right or forward/back feel the wrong way round, change FLIP_X or FLIP_Y below.

const int PIN_X = A0, PIN_Y = A1, PIN_SW = 2, PIN_BUZZER = 8;
const bool FLIP_X = false, FLIP_Y = false;

int cx = 512, cy = 512;                      // where the stick rests (measured at start-up)

void setup() {
  Serial.begin(115200);
  pinMode(PIN_SW, INPUT_PULLUP);             // pressed = LOW
  pinMode(PIN_BUZZER, OUTPUT);
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

void loop() {
  int x = axis(analogRead(PIN_X), cx);
  int y = -axis(analogRead(PIN_Y), cy);      // pushing the stick up gives a bigger y
  if (FLIP_X) x = -x;
  if (FLIP_Y) y = -y;
  Serial.print(x); Serial.print(','); Serial.print(y); Serial.print(','); Serial.println(digitalRead(PIN_SW) == LOW ? 1 : 0);

  while (Serial.available()) {               // the game sends C for a coin and H for getting hurt
    char c = Serial.read();
    if (c == 'C') tone(PIN_BUZZER, 1800, 80);
    else if (c == 'H') tone(PIN_BUZZER, 220, 200);
  }
  delay(20);
}
