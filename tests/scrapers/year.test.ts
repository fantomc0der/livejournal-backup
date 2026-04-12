import { describe, it, expect } from "bun:test";
import { extractDatesFromHtml } from "../../src/scrapers/year.ts";

const MOCK_YEAR_HTML = `
<!DOCTYPE html>
<html>
<head><title>myusername - 2002</title></head>
<body>
<div class="calendar">
  <h2>January 2002</h2>
  <table>
    <tr>
      <td>1</td>
      <td>2</td>
      <td><a href="https://myusername.livejournal.com/2002/01/03/">3 (1)</a></td>
      <td>4</td>
      <td>5</td>
      <td>6</td>
      <td>7</td>
    </tr>
    <tr>
      <td>8</td>
      <td>9</td>
      <td>10</td>
      <td>11</td>
      <td>12</td>
      <td>13</td>
      <td>14</td>
    </tr>
    <tr>
      <td>15</td>
      <td>16</td>
      <td>17</td>
      <td>18</td>
      <td>19</td>
      <td>20</td>
      <td>21</td>
    </tr>
    <tr>
      <td>22</td>
      <td>23</td>
      <td><a href="https://myusername.livejournal.com/2002/01/24/">24 (2)</a></td>
      <td>25</td>
      <td>26</td>
      <td>27</td>
      <td>28</td>
    </tr>
    <tr>
      <td>29</td>
      <td>30</td>
      <td>31</td>
    </tr>
  </table>
  <h2>February 2002</h2>
  <table>
    <tr>
      <td><a href="https://myusername.livejournal.com/2002/02/14/">14 (3)</a></td>
    </tr>
  </table>
</div>
</body>
</html>
`;

describe("extractDatesFromHtml", () => {
  it("extracts dates with entries from year page", () => {
    const dates = extractDatesFromHtml(MOCK_YEAR_HTML, 2002);
    expect(dates.length).toBe(3);
  });

  it("correctly parses year, month, day from URLs", () => {
    const dates = extractDatesFromHtml(MOCK_YEAR_HTML, 2002);
    const jan3 = dates.find((d) => d.month === 1 && d.day === 3);
    expect(jan3).toBeDefined();
    expect(jan3?.year).toBe(2002);
  });

  it("finds January 24 entry", () => {
    const dates = extractDatesFromHtml(MOCK_YEAR_HTML, 2002);
    const jan24 = dates.find((d) => d.month === 1 && d.day === 24);
    expect(jan24).toBeDefined();
  });

  it("finds February 14 entry", () => {
    const dates = extractDatesFromHtml(MOCK_YEAR_HTML, 2002);
    const feb14 = dates.find((d) => d.month === 2 && d.day === 14);
    expect(feb14).toBeDefined();
  });

  it("returns dates sorted chronologically", () => {
    const dates = extractDatesFromHtml(MOCK_YEAR_HTML, 2002);
    for (let i = 1; i < dates.length; i++) {
      const prev = dates[i - 1]!;
      const curr = dates[i]!;
      const prevVal = prev.month * 100 + prev.day;
      const currVal = curr.month * 100 + curr.day;
      expect(prevVal).toBeLessThan(currVal);
    }
  });

  it("deduplicates dates that appear multiple times", () => {
    const html = `<html><body>
      <a href="/2002/01/24/">24</a>
      <a href="/2002/01/24/">24 (2)</a>
    </body></html>`;
    const dates = extractDatesFromHtml(html, 2002);
    const jan24 = dates.filter((d) => d.month === 1 && d.day === 24);
    expect(jan24.length).toBe(1);
  });

  it("returns empty array for year page with no entries", () => {
    const html = "<html><body><p>No entries this year</p></body></html>";
    const dates = extractDatesFromHtml(html, 2002);
    expect(dates).toEqual([]);
  });

  it("extracts entry count from link text like '24 (2)'", () => {
    const dates = extractDatesFromHtml(MOCK_YEAR_HTML, 2002);
    const jan3 = dates.find((d) => d.month === 1 && d.day === 3);
    expect(jan3?.entryCount).toBe(1);
    const jan24 = dates.find((d) => d.month === 1 && d.day === 24);
    expect(jan24?.entryCount).toBe(2);
    const feb14 = dates.find((d) => d.month === 2 && d.day === 14);
    expect(feb14?.entryCount).toBe(3);
  });

  it("sets entryCount to undefined when link text has no count", () => {
    const html = `<html><body>
      <a href="/2002/01/05/">5</a>
    </body></html>`;
    const dates = extractDatesFromHtml(html, 2002);
    expect(dates[0]?.entryCount).toBeUndefined();
  });
});
