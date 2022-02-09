/* Regex-Groups:
 *  /{device}/{cmd}[?{option}[={args}]
 *
 *  device: [\w-]+
 *  cmd: [\w]+
 *  option: [\w]+
 *  args: [\w,]+
 *
 */
//                  /     {device}     /   {cmd}   [ ?   {option}   [=     {args}     ]  ]
const URL_REGEX = /\/(?<device>[\w-]+)\/(?<cmd>\w+)(\?(?<option>\w+)(=(?<args>([\w,]+))?))?/;
let text = "/test/122";

console.log(text, text.match(URL_REGEX), URL_REGEX.test(text));

text = "/dev-12/0?f=0,12,20";

console.log(text, text.match(URL_REGEX));

// --

let personList = `First_Name: John, Last_Name: Doe
First_Name: Jane, Last_Name: Smith`;

let regexpNames =  /First_Name: (?<firstname>\w+), Last_Name: (?<lastname>\w+)/mg;
let match = regexpNames.exec(personList);
do {
    console.log(`Hello ${match.groups.firstname} ${match.groups.lastname}`);
} while((match = regexpNames.exec(personList)) !== null);
