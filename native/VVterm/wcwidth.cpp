/*
 * This is an implementation of wcwidth() and wcswidth() (defined in
 * IEEE Std 1002.1-2001) for Unicode.
 *
 * http://www.opengroup.org/onlinepubs/007904975/functions/wcwidth.html
 * http://www.opengroup.org/onlinepubs/007904975/functions/wcswidth.html
 *
 * In fixed-width output devices, Latin characters all occupy a single
 * "cell" position of equal width, whereas ideographic CJK characters
 * occupy two such cells. Interoperability between terminal-line
 * applications and (teletype-style) character terminals using the
 * UTF-8 encoding requires agreement on which character should advance
 * the cursor by how many cell positions. No established formal
 * standards exist at present on which Unicode character shall occupy
 * how many cell positions on character terminals. These routines are
 * a first attempt of defining such behavior based on simple rules
 * applied to data provided by the Unicode Consortium.
 *
 * For some graphical characters, the Unicode standard explicitly
 * defines a character-cell width via the definition of the East Asian
 * FullWidth (F), Wide (W), Half-width (H), and Narrow (Na) classes.
 * In all these cases, there is no ambiguity about which width a
 * terminal shall use. For characters in the East Asian Ambiguous (A)
 * class, the width choice depends purely on a preference of backward
 * compatibility with either historic CJK or Western practice.
 * Choosing single-width for these characters is easy to justify as
 * the appropriate long-term solution, as the CJK practice of
 * displaying these characters as double-width comes from historic
 * implementation simplicity (8-bit encoded characters were displayed
 * single-width and 16-bit ones double-width, even for Greek,
 * Cyrillic, etc.) and not any typographic considerations.
 *
 * Much less clear is the choice of width for the Not East Asian
 * (Neutral) class. Existing practice does not dictate a width for any
 * of these characters. It would nevertheless make sense
 * typographically to allocate two character cells to characters such
 * as for instance EM SPACE or VOLUME INTEGRAL, which cannot be
 * represented adequately with a single-width glyph. The following
 * routines at present merely assign a single-cell width to all
 * neutral characters, in the interest of simplicity. This is not
 * entirely satisfactory and should be reconsidered before
 * establishing a formal standard in this area. At the moment, the
 * decision which Not East Asian (Neutral) characters should be
 * represented by double-width glyphs cannot yet be answered by
 * applying a simple rule from the Unicode database content. Setting
 * up a proper standard for the behavior of UTF-8 character terminals
 * will require a careful analysis not only of each Unicode character,
 * but also of each presentation form, something the author of these
 * routines has avoided to do so far.
 *
 * http://www.unicode.org/unicode/reports/tr11/
 *
 * Markus Kuhn -- 2007-05-26 (Unicode 5.0)
 *
 * Permission to use, copy, modify, and distribute this software
 * for any purpose and without fee is hereby granted. The author
 * disclaims all warranties with regard to this software.
 *
 * Latest version: http://www.cl.cam.ac.uk/~mgk25/ucs/wcwidth.c
 */

#include <wchar.h>

#include "wcwidth.h"
#include "internal.h"

struct interval {
    unsigned int first;
    unsigned int last;
};

/* auxiliary function for binary search in interval table */
static bool bisearch(unsigned int ucs, const struct interval *table, int max)
{
    int min = 0;
    int mid;

    if (ucs < table[0].first || ucs > table[max].last)
        return false;

    while (max >= min)
    {
        mid = (min + max) / 2;
        if (ucs > table[mid].last)
            min = mid + 1;
        else if (ucs < table[mid].first)
            max = mid - 1;
        else
            return true;
    }

    return false;
}


/* The following two functions define the column width of an ISO 10646
 * character as follows:
 *
 *    - The null character (U+0000) has a column width of 0.
 *
 *    - Other C0/C1 control characters and DEL will lead to a return
 *      value of -1.
 *
 *    - Non-spacing and enclosing combining characters (general
 *      category code Mn or Me in the Unicode database) have a
 *      column width of 0.
 *
 *    - SOFT HYPHEN (U+00AD) has a column width of 1.
 *
 *    - Other format characters (general category code Cf in the Unicode
 *      database) and ZERO WIDTH SPACE (U+200B) have a column width of 0.
 *
 *    - Hangul Jamo medial vowels and final consonants (U+1160-U+11FF)
 *      have a column width of 0.
 *
 *    - Spacing characters in the East Asian Wide (W) or East Asian
 *      Full-width (F) category as defined in Unicode Technical
 *      Report #11 have a column width of 2.
 *
 *    - All remaining characters (including all printable
 *      ISO 8859-1 and WGL4 characters, Unicode control characters,
 *      etc.) have a column width of 1.
 *
 * This implementation assumes that wchar_t characters are encoded
 * in ISO 10646.
 */

int mk_wcwidth(unsigned int ucs)
{
  /* sorted list of non-overlapping intervals of non-spacing characters */
  /* generated by the following Perl
   * from the Unicode 14.0.0 data files available at:
   * https://www.unicode.org/Public/14.0.0/ucd/

open DATA, "<", "UnicodeData.txt" || die "$!";
while (<DATA>) {
    @fields = split /;/;
    $chr = hex $fields[0];
    $cat = $fields[2];
    $include = ($cat eq "Me" || $cat eq "Mn" || $cat eq "Cf");
    $include = 0 if ($chr == 0x00AD);
    $include = 1 if (0x1160 <= $chr && $chr <= 0x11FF);
    $include = 1 if ($chr == 0x200B);
    $chrs{$chr} = $include;
}
close DATA;
for ($chr = 0; $chr < 0x110000; $chr++) {
    if ($chrs{$chr}) {
        $start = $chr;
        $chr++ while $chrs{$chr};
        printf "    { 0x%04X, 0x%04X },\n", $start, $chr-1;
    }
}

   */
    static const struct interval combining[] = {
        { 0x0300, 0x036F },
        { 0x0483, 0x0489 },
        { 0x0591, 0x05BD },
        { 0x05BF, 0x05BF },
        { 0x05C1, 0x05C2 },
        { 0x05C4, 0x05C5 },
        { 0x05C7, 0x05C7 },
        { 0x0600, 0x0605 },
        { 0x0610, 0x061A },
        { 0x061C, 0x061C },
        { 0x064B, 0x065F },
        { 0x0670, 0x0670 },
        { 0x06D6, 0x06DD },
        { 0x06DF, 0x06E4 },
        { 0x06E7, 0x06E8 },
        { 0x06EA, 0x06ED },
        { 0x070F, 0x070F },
        { 0x0711, 0x0711 },
        { 0x0730, 0x074A },
        { 0x07A6, 0x07B0 },
        { 0x07EB, 0x07F3 },
        { 0x07FD, 0x07FD },
        { 0x0816, 0x0819 },
        { 0x081B, 0x0823 },
        { 0x0825, 0x0827 },
        { 0x0829, 0x082D },
        { 0x0859, 0x085B },
        { 0x0890, 0x0891 },
        { 0x0898, 0x089F },
        { 0x08CA, 0x0902 },
        { 0x093A, 0x093A },
        { 0x093C, 0x093C },
        { 0x0941, 0x0948 },
        { 0x094D, 0x094D },
        { 0x0951, 0x0957 },
        { 0x0962, 0x0963 },
        { 0x0981, 0x0981 },
        { 0x09BC, 0x09BC },
        { 0x09C1, 0x09C4 },
        { 0x09CD, 0x09CD },
        { 0x09E2, 0x09E3 },
        { 0x09FE, 0x09FE },
        { 0x0A01, 0x0A02 },
        { 0x0A3C, 0x0A3C },
        { 0x0A41, 0x0A42 },
        { 0x0A47, 0x0A48 },
        { 0x0A4B, 0x0A4D },
        { 0x0A51, 0x0A51 },
        { 0x0A70, 0x0A71 },
        { 0x0A75, 0x0A75 },
        { 0x0A81, 0x0A82 },
        { 0x0ABC, 0x0ABC },
        { 0x0AC1, 0x0AC5 },
        { 0x0AC7, 0x0AC8 },
        { 0x0ACD, 0x0ACD },
        { 0x0AE2, 0x0AE3 },
        { 0x0AFA, 0x0AFF },
        { 0x0B01, 0x0B01 },
        { 0x0B3C, 0x0B3C },
        { 0x0B3F, 0x0B3F },
        { 0x0B41, 0x0B44 },
        { 0x0B4D, 0x0B4D },
        { 0x0B55, 0x0B56 },
        { 0x0B62, 0x0B63 },
        { 0x0B82, 0x0B82 },
        { 0x0BC0, 0x0BC0 },
        { 0x0BCD, 0x0BCD },
        { 0x0C00, 0x0C00 },
        { 0x0C04, 0x0C04 },
        { 0x0C3C, 0x0C3C },
        { 0x0C3E, 0x0C40 },
        { 0x0C46, 0x0C48 },
        { 0x0C4A, 0x0C4D },
        { 0x0C55, 0x0C56 },
        { 0x0C62, 0x0C63 },
        { 0x0C81, 0x0C81 },
        { 0x0CBC, 0x0CBC },
        { 0x0CBF, 0x0CBF },
        { 0x0CC6, 0x0CC6 },
        { 0x0CCC, 0x0CCD },
        { 0x0CE2, 0x0CE3 },
        { 0x0D00, 0x0D01 },
        { 0x0D3B, 0x0D3C },
        { 0x0D41, 0x0D44 },
        { 0x0D4D, 0x0D4D },
        { 0x0D62, 0x0D63 },
        { 0x0D81, 0x0D81 },
        { 0x0DCA, 0x0DCA },
        { 0x0DD2, 0x0DD4 },
        { 0x0DD6, 0x0DD6 },
        { 0x0E31, 0x0E31 },
        { 0x0E34, 0x0E3A },
        { 0x0E47, 0x0E4E },
        { 0x0EB1, 0x0EB1 },
        { 0x0EB4, 0x0EBC },
        { 0x0EC8, 0x0ECD },
        { 0x0F18, 0x0F19 },
        { 0x0F35, 0x0F35 },
        { 0x0F37, 0x0F37 },
        { 0x0F39, 0x0F39 },
        { 0x0F71, 0x0F7E },
        { 0x0F80, 0x0F84 },
        { 0x0F86, 0x0F87 },
        { 0x0F8D, 0x0F97 },
        { 0x0F99, 0x0FBC },
        { 0x0FC6, 0x0FC6 },
        { 0x102D, 0x1030 },
        { 0x1032, 0x1037 },
        { 0x1039, 0x103A },
        { 0x103D, 0x103E },
        { 0x1058, 0x1059 },
        { 0x105E, 0x1060 },
        { 0x1071, 0x1074 },
        { 0x1082, 0x1082 },
        { 0x1085, 0x1086 },
        { 0x108D, 0x108D },
        { 0x109D, 0x109D },
        { 0x1160, 0x11FF },
        { 0x135D, 0x135F },
        { 0x1712, 0x1714 },
        { 0x1732, 0x1733 },
        { 0x1752, 0x1753 },
        { 0x1772, 0x1773 },
        { 0x17B4, 0x17B5 },
        { 0x17B7, 0x17BD },
        { 0x17C6, 0x17C6 },
        { 0x17C9, 0x17D3 },
        { 0x17DD, 0x17DD },
        { 0x180B, 0x180F },
        { 0x1885, 0x1886 },
        { 0x18A9, 0x18A9 },
        { 0x1920, 0x1922 },
        { 0x1927, 0x1928 },
        { 0x1932, 0x1932 },
        { 0x1939, 0x193B },
        { 0x1A17, 0x1A18 },
        { 0x1A1B, 0x1A1B },
        { 0x1A56, 0x1A56 },
        { 0x1A58, 0x1A5E },
        { 0x1A60, 0x1A60 },
        { 0x1A62, 0x1A62 },
        { 0x1A65, 0x1A6C },
        { 0x1A73, 0x1A7C },
        { 0x1A7F, 0x1A7F },
        { 0x1AB0, 0x1ACE },
        { 0x1B00, 0x1B03 },
        { 0x1B34, 0x1B34 },
        { 0x1B36, 0x1B3A },
        { 0x1B3C, 0x1B3C },
        { 0x1B42, 0x1B42 },
        { 0x1B6B, 0x1B73 },
        { 0x1B80, 0x1B81 },
        { 0x1BA2, 0x1BA5 },
        { 0x1BA8, 0x1BA9 },
        { 0x1BAB, 0x1BAD },
        { 0x1BE6, 0x1BE6 },
        { 0x1BE8, 0x1BE9 },
        { 0x1BED, 0x1BED },
        { 0x1BEF, 0x1BF1 },
        { 0x1C2C, 0x1C33 },
        { 0x1C36, 0x1C37 },
        { 0x1CD0, 0x1CD2 },
        { 0x1CD4, 0x1CE0 },
        { 0x1CE2, 0x1CE8 },
        { 0x1CED, 0x1CED },
        { 0x1CF4, 0x1CF4 },
        { 0x1CF8, 0x1CF9 },
        { 0x1DC0, 0x1DFF },
        { 0x200B, 0x200F },
        { 0x202A, 0x202E },
        { 0x2060, 0x2064 },
        { 0x2066, 0x206F },
        { 0x20D0, 0x20F0 },
        { 0x2CEF, 0x2CF1 },
        { 0x2D7F, 0x2D7F },
        { 0x2DE0, 0x2DFF },
        { 0x302A, 0x302D },
        { 0x3099, 0x309A },
        { 0xA66F, 0xA672 },
        { 0xA674, 0xA67D },
        { 0xA69E, 0xA69F },
        { 0xA6F0, 0xA6F1 },
        { 0xA802, 0xA802 },
        { 0xA806, 0xA806 },
        { 0xA80B, 0xA80B },
        { 0xA825, 0xA826 },
        { 0xA82C, 0xA82C },
        { 0xA8C4, 0xA8C5 },
        { 0xA8E0, 0xA8F1 },
        { 0xA8FF, 0xA8FF },
        { 0xA926, 0xA92D },
        { 0xA947, 0xA951 },
        { 0xA980, 0xA982 },
        { 0xA9B3, 0xA9B3 },
        { 0xA9B6, 0xA9B9 },
        { 0xA9BC, 0xA9BD },
        { 0xA9E5, 0xA9E5 },
        { 0xAA29, 0xAA2E },
        { 0xAA31, 0xAA32 },
        { 0xAA35, 0xAA36 },
        { 0xAA43, 0xAA43 },
        { 0xAA4C, 0xAA4C },
        { 0xAA7C, 0xAA7C },
        { 0xAAB0, 0xAAB0 },
        { 0xAAB2, 0xAAB4 },
        { 0xAAB7, 0xAAB8 },
        { 0xAABE, 0xAABF },
        { 0xAAC1, 0xAAC1 },
        { 0xAAEC, 0xAAED },
        { 0xAAF6, 0xAAF6 },
        { 0xABE5, 0xABE5 },
        { 0xABE8, 0xABE8 },
        { 0xABED, 0xABED },
        { 0xFB1E, 0xFB1E },
        { 0xFE00, 0xFE0F },
        { 0xFE20, 0xFE2F },
        { 0xFEFF, 0xFEFF },
        { 0xFFF9, 0xFFFB },
        { 0x101FD, 0x101FD },
        { 0x102E0, 0x102E0 },
        { 0x10376, 0x1037A },
        { 0x10A01, 0x10A03 },
        { 0x10A05, 0x10A06 },
        { 0x10A0C, 0x10A0F },
        { 0x10A38, 0x10A3A },
        { 0x10A3F, 0x10A3F },
        { 0x10AE5, 0x10AE6 },
        { 0x10D24, 0x10D27 },
        { 0x10EAB, 0x10EAC },
        { 0x10F46, 0x10F50 },
        { 0x10F82, 0x10F85 },
        { 0x11001, 0x11001 },
        { 0x11038, 0x11046 },
        { 0x11070, 0x11070 },
        { 0x11073, 0x11074 },
        { 0x1107F, 0x11081 },
        { 0x110B3, 0x110B6 },
        { 0x110B9, 0x110BA },
        { 0x110BD, 0x110BD },
        { 0x110C2, 0x110C2 },
        { 0x110CD, 0x110CD },
        { 0x11100, 0x11102 },
        { 0x11127, 0x1112B },
        { 0x1112D, 0x11134 },
        { 0x11173, 0x11173 },
        { 0x11180, 0x11181 },
        { 0x111B6, 0x111BE },
        { 0x111C9, 0x111CC },
        { 0x111CF, 0x111CF },
        { 0x1122F, 0x11231 },
        { 0x11234, 0x11234 },
        { 0x11236, 0x11237 },
        { 0x1123E, 0x1123E },
        { 0x112DF, 0x112DF },
        { 0x112E3, 0x112EA },
        { 0x11300, 0x11301 },
        { 0x1133B, 0x1133C },
        { 0x11340, 0x11340 },
        { 0x11366, 0x1136C },
        { 0x11370, 0x11374 },
        { 0x11438, 0x1143F },
        { 0x11442, 0x11444 },
        { 0x11446, 0x11446 },
        { 0x1145E, 0x1145E },
        { 0x114B3, 0x114B8 },
        { 0x114BA, 0x114BA },
        { 0x114BF, 0x114C0 },
        { 0x114C2, 0x114C3 },
        { 0x115B2, 0x115B5 },
        { 0x115BC, 0x115BD },
        { 0x115BF, 0x115C0 },
        { 0x115DC, 0x115DD },
        { 0x11633, 0x1163A },
        { 0x1163D, 0x1163D },
        { 0x1163F, 0x11640 },
        { 0x116AB, 0x116AB },
        { 0x116AD, 0x116AD },
        { 0x116B0, 0x116B5 },
        { 0x116B7, 0x116B7 },
        { 0x1171D, 0x1171F },
        { 0x11722, 0x11725 },
        { 0x11727, 0x1172B },
        { 0x1182F, 0x11837 },
        { 0x11839, 0x1183A },
        { 0x1193B, 0x1193C },
        { 0x1193E, 0x1193E },
        { 0x11943, 0x11943 },
        { 0x119D4, 0x119D7 },
        { 0x119DA, 0x119DB },
        { 0x119E0, 0x119E0 },
        { 0x11A01, 0x11A0A },
        { 0x11A33, 0x11A38 },
        { 0x11A3B, 0x11A3E },
        { 0x11A47, 0x11A47 },
        { 0x11A51, 0x11A56 },
        { 0x11A59, 0x11A5B },
        { 0x11A8A, 0x11A96 },
        { 0x11A98, 0x11A99 },
        { 0x11C30, 0x11C36 },
        { 0x11C38, 0x11C3D },
        { 0x11C3F, 0x11C3F },
        { 0x11C92, 0x11CA7 },
        { 0x11CAA, 0x11CB0 },
        { 0x11CB2, 0x11CB3 },
        { 0x11CB5, 0x11CB6 },
        { 0x11D31, 0x11D36 },
        { 0x11D3A, 0x11D3A },
        { 0x11D3C, 0x11D3D },
        { 0x11D3F, 0x11D45 },
        { 0x11D47, 0x11D47 },
        { 0x11D90, 0x11D91 },
        { 0x11D95, 0x11D95 },
        { 0x11D97, 0x11D97 },
        { 0x11EF3, 0x11EF4 },
        { 0x13430, 0x13438 },
        { 0x16AF0, 0x16AF4 },
        { 0x16B30, 0x16B36 },
        { 0x16F4F, 0x16F4F },
        { 0x16F8F, 0x16F92 },
        { 0x16FE4, 0x16FE4 },
        { 0x1BC9D, 0x1BC9E },
        { 0x1BCA0, 0x1BCA3 },
        { 0x1CF00, 0x1CF2D },
        { 0x1CF30, 0x1CF46 },
        { 0x1D167, 0x1D169 },
        { 0x1D173, 0x1D182 },
        { 0x1D185, 0x1D18B },
        { 0x1D1AA, 0x1D1AD },
        { 0x1D242, 0x1D244 },
        { 0x1DA00, 0x1DA36 },
        { 0x1DA3B, 0x1DA6C },
        { 0x1DA75, 0x1DA75 },
        { 0x1DA84, 0x1DA84 },
        { 0x1DA9B, 0x1DA9F },
        { 0x1DAA1, 0x1DAAF },
        { 0x1E000, 0x1E006 },
        { 0x1E008, 0x1E018 },
        { 0x1E01B, 0x1E021 },
        { 0x1E023, 0x1E024 },
        { 0x1E026, 0x1E02A },
        { 0x1E130, 0x1E136 },
        { 0x1E2AE, 0x1E2AE },
        { 0x1E2EC, 0x1E2EF },
        { 0x1E8D0, 0x1E8D6 },
        { 0x1E944, 0x1E94A },
        { 0xE0001, 0xE0001 },
        { 0xE0020, 0xE007F },
        { 0xE0100, 0xE01EF },
    };

    // A sorted list of intervals of double-width characters generated by:
    // https://raw.githubusercontent.com/GNOME/glib/37d4c2941bd0326b8b6e6bb22c81bd424fcc040b/glib/gen-unicode-tables.pl
    // from the Unicode 14.0.0 data files available at:
    // https://www.unicode.org/Public/14.0.0/ucd/
    static const struct interval wide[] = {
        {0x1100, 0x115F},
        {0x231A, 0x231B},
        {0x2329, 0x232A},
        {0x23E9, 0x23EC},
        {0x23F0, 0x23F0},
        {0x23F3, 0x23F3},
        {0x25FD, 0x25FE},
        {0x2614, 0x2615},
        {0x2648, 0x2653},
        {0x267F, 0x267F},
        {0x2693, 0x2693},
        {0x26A1, 0x26A1},
        {0x26AA, 0x26AB},
        {0x26BD, 0x26BE},
        {0x26C4, 0x26C5},
        {0x26CE, 0x26CE},
        {0x26D4, 0x26D4},
        {0x26EA, 0x26EA},
        {0x26F2, 0x26F3},
        {0x26F5, 0x26F5},
        {0x26FA, 0x26FA},
        {0x26FD, 0x26FD},
        {0x2705, 0x2705},
        {0x270A, 0x270B},
        {0x2728, 0x2728},
        {0x274C, 0x274C},
        {0x274E, 0x274E},
        {0x2753, 0x2755},
        {0x2757, 0x2757},
        {0x2795, 0x2797},
        {0x27B0, 0x27B0},
        {0x27BF, 0x27BF},
        {0x2B1B, 0x2B1C},
        {0x2B50, 0x2B50},
        {0x2B55, 0x2B55},
        {0x2E80, 0x2E99},
        {0x2E9B, 0x2EF3},
        {0x2F00, 0x2FD5},
        {0x2FF0, 0x2FFB},
        {0x3000, 0x303E},
        {0x3041, 0x3096},
        {0x3099, 0x30FF},
        {0x3105, 0x312F},
        {0x3131, 0x318E},
        {0x3190, 0x31E3},
        {0x31F0, 0x321E},
        {0x3220, 0x3247},
        {0x3250, 0x4DBF},
        {0x4E00, 0xA48C},
        {0xA490, 0xA4C6},
        {0xA960, 0xA97C},
        {0xAC00, 0xD7A3},
        {0xF900, 0xFAFF},
        {0xFE10, 0xFE19},
        {0xFE30, 0xFE52},
        {0xFE54, 0xFE66},
        {0xFE68, 0xFE6B},
        {0xFF01, 0xFF60},
        {0xFFE0, 0xFFE6},
        {0x16FE0, 0x16FE4},
        {0x16FF0, 0x16FF1},
        {0x17000, 0x187F7},
        {0x18800, 0x18CD5},
        {0x18D00, 0x18D08},
        {0x1AFF0, 0x1AFF3},
        {0x1AFF5, 0x1AFFB},
        {0x1AFFD, 0x1AFFE},
        {0x1B000, 0x1B122},
        {0x1B150, 0x1B152},
        {0x1B164, 0x1B167},
        {0x1B170, 0x1B2FB},
        {0x1F004, 0x1F004},
        {0x1F0CF, 0x1F0CF},
        {0x1F18E, 0x1F18E},
        {0x1F191, 0x1F19A},
        {0x1F200, 0x1F202},
        {0x1F210, 0x1F23B},
        {0x1F240, 0x1F248},
        {0x1F250, 0x1F251},
        {0x1F260, 0x1F265},
        {0x1F300, 0x1F320},
        {0x1F32D, 0x1F335},
        {0x1F337, 0x1F37C},
        {0x1F37E, 0x1F393},
        {0x1F3A0, 0x1F3CA},
        {0x1F3CF, 0x1F3D3},
        {0x1F3E0, 0x1F3F0},
        {0x1F3F4, 0x1F3F4},
        {0x1F3F8, 0x1F43E},
        {0x1F440, 0x1F440},
        {0x1F442, 0x1F4FC},
        {0x1F4FF, 0x1F53D},
        {0x1F54B, 0x1F54E},
        {0x1F550, 0x1F567},
        {0x1F57A, 0x1F57A},
        {0x1F595, 0x1F596},
        {0x1F5A4, 0x1F5A4},
        {0x1F5FB, 0x1F64F},
        {0x1F680, 0x1F6C5},
        {0x1F6CC, 0x1F6CC},
        {0x1F6D0, 0x1F6D2},
        {0x1F6D5, 0x1F6D7},
        {0x1F6DD, 0x1F6DF},
        {0x1F6EB, 0x1F6EC},
        {0x1F6F4, 0x1F6FC},
        {0x1F7E0, 0x1F7EB},
        {0x1F7F0, 0x1F7F0},
        {0x1F90C, 0x1F93A},
        {0x1F93C, 0x1F945},
        {0x1F947, 0x1F9FF},
        {0x1FA70, 0x1FA74},
        {0x1FA78, 0x1FA7C},
        {0x1FA80, 0x1FA86},
        {0x1FA90, 0x1FAAC},
        {0x1FAB0, 0x1FABA},
        {0x1FAC0, 0x1FAC5},
        {0x1FAD0, 0x1FAD9},
        {0x1FAE0, 0x1FAE7},
        {0x1FAF0, 0x1FAF6},
        {0x20000, 0x2FFFD},
        {0x30000, 0x3FFFD},
    };

    // test for 8-bit control characters
    if(ucs == 0)
        return 0;
    if(ucs < 32 || (ucs >= 0x7f && ucs < 0xa0))
        return -1;

    /* binary search in table of non-spacing characters */
    if(bisearch(ucs, combining,
        sizeof(combining) / sizeof(struct interval) - 1))
        return 0;

    // if we arrive here, ucs is not a combining or C0/C1 control character

    // binary search in table of double-width characters
    if(bisearch(ucs, wide, sizeof(wide) / sizeof(struct interval) - 1))
        return 2;

    // normal width character
    return 1;
}

int mk_wcswidth(const unsigned int *pwcs, size_t n)
{
    int w, width = 0;

    for (;*pwcs && n-- > 0; pwcs++)
    {
        if ((w = mk_wcwidth(*pwcs)) < 0)
            return -1;
        else
            width += w;
    }

    return width;
}
